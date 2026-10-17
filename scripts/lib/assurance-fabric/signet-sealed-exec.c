#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <linux/memfd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef MFD_CLOEXEC
#define MFD_CLOEXEC 0x0001U
#endif
#ifndef MFD_ALLOW_SEALING
#define MFD_ALLOW_SEALING 0x0002U
#endif
#ifndef F_ADD_SEALS
#define F_ADD_SEALS 1033
#endif
#ifndef F_GET_SEALS
#define F_GET_SEALS 1034
#endif
#ifndef F_SEAL_SEAL
#define F_SEAL_SEAL 0x0001
#endif
#ifndef F_SEAL_SHRINK
#define F_SEAL_SHRINK 0x0002
#endif
#ifndef F_SEAL_GROW
#define F_SEAL_GROW 0x0004
#endif
#ifndef F_SEAL_WRITE
#define F_SEAL_WRITE 0x0008
#endif

#define MAX_VERIFIER_BYTES (64u * 1024u * 1024u)
#define VERIFIER_FD 3
#define EXIT_SEAL 2
#define EXIT_PIN 3
#define EXIT_ARGS 4

/* FIPS PUB 180-4 §4.2.2 */
static const uint32_t k_sha256[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u,
    0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u, 0xe49b69c1u, 0xefbe4786u,
    0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
    0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u, 0xa2bfe8a1u, 0xa81a664bu,
    0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au,
    0x5b9cca4fu, 0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
};

static uint32_t rotr32(uint32_t value, unsigned bits)
{
    return (value >> bits) | (value << (32u - bits));
}

static uint32_t load_be32(const uint8_t *bytes)
{
    return ((uint32_t)bytes[0] << 24) | ((uint32_t)bytes[1] << 16) |
           ((uint32_t)bytes[2] << 8) | (uint32_t)bytes[3];
}

static void store_be32(uint8_t *bytes, uint32_t value)
{
    bytes[0] = (uint8_t)(value >> 24);
    bytes[1] = (uint8_t)(value >> 16);
    bytes[2] = (uint8_t)(value >> 8);
    bytes[3] = (uint8_t)value;
}

static void store_be64(uint8_t *bytes, uint64_t value)
{
    bytes[0] = (uint8_t)(value >> 56);
    bytes[1] = (uint8_t)(value >> 48);
    bytes[2] = (uint8_t)(value >> 40);
    bytes[3] = (uint8_t)(value >> 32);
    bytes[4] = (uint8_t)(value >> 24);
    bytes[5] = (uint8_t)(value >> 16);
    bytes[6] = (uint8_t)(value >> 8);
    bytes[7] = (uint8_t)value;
}

static void sha256_compress(uint32_t state[8], const uint8_t block[64])
{
    uint32_t w[64];
    uint32_t a, b, c, d, e, f, g, h;
    unsigned i;

    for (i = 0; i < 16; i++) {
        w[i] = load_be32(block + (i * 4u));
    }
    for (i = 16; i < 64; i++) {
        uint32_t s0 = rotr32(w[i - 15u], 7u) ^ rotr32(w[i - 15u], 18u) ^
                      (w[i - 15u] >> 3u);
        uint32_t s1 = rotr32(w[i - 2u], 17u) ^ rotr32(w[i - 2u], 19u) ^
                      (w[i - 2u] >> 10u);
        w[i] = w[i - 16u] + s0 + w[i - 7u] + s1;
    }

    a = state[0];
    b = state[1];
    c = state[2];
    d = state[3];
    e = state[4];
    f = state[5];
    g = state[6];
    h = state[7];
    for (i = 0; i < 64; i++) {
        uint32_t S1 = rotr32(e, 6u) ^ rotr32(e, 11u) ^ rotr32(e, 25u);
        uint32_t ch = (e & f) ^ ((~e) & g);
        uint32_t temp1 = h + S1 + ch + k_sha256[i] + w[i];
        uint32_t S0 = rotr32(a, 2u) ^ rotr32(a, 13u) ^ rotr32(a, 22u);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t temp2 = S0 + maj;
        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
    state[5] += f;
    state[6] += g;
    state[7] += h;
}

static void sha256(const uint8_t *data, size_t length, uint8_t out[32])
{
    uint32_t state[8] = {
        0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
        0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
    };
    uint8_t block[64];
    size_t offset = 0;
    size_t remaining;
    unsigned i;

    while (length - offset >= 64u) {
        sha256_compress(state, data + offset);
        offset += 64u;
    }

    remaining = length - offset;
    if (remaining > 0) {
        memcpy(block, data + offset, remaining);
    }
    block[remaining] = 0x80u;
    if (remaining + 1u <= 56u) {
        memset(block + remaining + 1u, 0, 56u - (remaining + 1u));
    } else {
        memset(block + remaining + 1u, 0, 64u - (remaining + 1u));
        sha256_compress(state, block);
        memset(block, 0, 56u);
    }
    store_be64(block + 56, (uint64_t)length * 8u);
    sha256_compress(state, block);

    for (i = 0; i < 8; i++) {
        store_be32(out + (i * 4u), state[i]);
    }
}

static int hex_nibble(char c)
{
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return c - 'a' + 10;
    }
    return -1;
}

static int parse_pin(const char *hex, uint8_t out[32])
{
    size_t i;
    if (hex == NULL || strlen(hex) != 64u) {
        return -1;
    }
    for (i = 0; i < 32u; i++) {
        int hi = hex_nibble(hex[i * 2u]);
        int lo = hex_nibble(hex[i * 2u + 1u]);
        if (hi < 0 || lo < 0) {
            return -1;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return 0;
}

static int digest_eq(const uint8_t left[32], const uint8_t right[32])
{
    uint8_t acc = 0;
    size_t i;
    for (i = 0; i < 32u; i++) {
        acc |= (uint8_t)(left[i] ^ right[i]);
    }
    return acc == 0;
}

static uint8_t *read_fd(int fd, size_t *out_size)
{
    struct stat st;
    uint8_t *buf;
    size_t size;
    size_t off = 0;

    if (fstat(fd, &st) != 0 || st.st_size <= 0 ||
        (unsigned long long)st.st_size > MAX_VERIFIER_BYTES) {
        return NULL;
    }
    size = (size_t)st.st_size;
    if (lseek(fd, 0, SEEK_SET) < 0) {
        return NULL;
    }
    buf = (uint8_t *)malloc(size);
    if (buf == NULL) {
        return NULL;
    }
    while (off < size) {
        ssize_t n = read(fd, buf + off, size - off);
        if (n <= 0) {
            free(buf);
            return NULL;
        }
        off += (size_t)n;
    }
    *out_size = size;
    return buf;
}

static int sealed_memfd_from_bytes(const uint8_t *buf, size_t size)
{
    int mfd;
    size_t off = 0;
    unsigned want;
    int seals;

    mfd = memfd_create("signet-verifier", MFD_CLOEXEC | MFD_ALLOW_SEALING);
    if (mfd < 0) {
        return -1;
    }
    while (off < size) {
        ssize_t n = write(mfd, buf + off, size - off);
        if (n <= 0) {
            close(mfd);
            return -1;
        }
        off += (size_t)n;
    }
    if (lseek(mfd, 0, SEEK_SET) < 0) {
        close(mfd);
        return -1;
    }
    if (fcntl(mfd, F_ADD_SEALS,
              F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0) {
        close(mfd);
        return -1;
    }
    seals = fcntl(mfd, F_GET_SEALS);
    want = (unsigned)(F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL);
    if (seals < 0 || ((unsigned)seals & want) != want) {
        close(mfd);
        return -1;
    }
    if (fprintf(stderr, "SEALS:%u\n", (unsigned)seals) < 0) {
        close(mfd);
        return -1;
    }
    return mfd;
}

int main(int argc, char **argv)
{
    uint8_t want[32];
    uint8_t got[32];
    uint8_t *bytes = NULL;
    size_t size = 0;
    int mem_fd = -1;
    int flags;
    char *child_argv[2];
    char *empty_envp[1];

    if (argc != 2 || parse_pin(argv[1], want) != 0) {
        return EXIT_ARGS;
    }
    bytes = read_fd(VERIFIER_FD, &size);
    if (bytes == NULL) {
        return EXIT_SEAL;
    }
    sha256(bytes, size, got);
    if (!digest_eq(got, want)) {
        memset(bytes, 0, size);
        free(bytes);
        return EXIT_PIN;
    }
    mem_fd = sealed_memfd_from_bytes(bytes, size);
    memset(bytes, 0, size);
    free(bytes);
    bytes = NULL;
    if (mem_fd < 0) {
        return EXIT_SEAL;
    }
    (void)close(VERIFIER_FD);
    flags = fcntl(mem_fd, F_GETFD);
    if (flags >= 0) {
        (void)fcntl(mem_fd, F_SETFD, flags & ~FD_CLOEXEC);
    }
    child_argv[0] = (char *)"galerina-signet-verifier";
    child_argv[1] = NULL;
    empty_envp[0] = NULL;
    fexecve(mem_fd, child_argv, empty_envp);
    return EXIT_SEAL;
}
