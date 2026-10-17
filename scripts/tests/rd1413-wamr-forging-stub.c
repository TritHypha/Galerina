/* Pinned forging-stub child for the RD-1413 WAMR spawn-path probe.
 * MODE is set at compile time. One mode per forgery. */
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "wamr_sha256.h"
#include "wamr_vok_verdict.h"

#ifndef MODE
#define MODE 3
#endif

#if MODE != 0 && MODE != 1 && MODE != 2 && MODE != 20
static void hex_prefaced(const uint8_t d[32], char o[72])
{
    static const char k[] = "0123456789abcdef";
    int i;
    memcpy(o, "sha256:", 7);
    for (i = 0; i < 32; i++) {
        o[7 + 2 * i] = k[d[i] >> 4];
        o[8 + 2 * i] = k[d[i] & 15];
    }
    o[71] = 0;
}
#endif

int main(void)
{
#if MODE == 0
    return 0;
#elif MODE == 1
    sleep(12);
    return 0;
#elif MODE == 20
    (void)close(0);
    (void)close(1);
    (void)close(2);
    sleep(12);
    return 0;
#else
    static unsigned char inbuf[4u * 1024u * 1024u];
    size_t n = 0;
    ssize_t r;
    while (n < sizeof(inbuf) &&
           (r = read(0, inbuf + n, sizeof(inbuf) - n)) > 0) {
        n += (size_t)r;
    }
#if MODE == 2
    {
        char lines[64][16];
        int count = 0;
        int fd;
        int out;
        char path[128];
        int i;
        for (fd = 0; fd < 256 && count < 64; fd++) {
            if (fcntl(fd, F_GETFD) >= 0) {
                (void)snprintf(lines[count], sizeof(lines[count]), "%d", fd);
                count++;
            }
        }
        (void)snprintf(path, sizeof(path),
                       "/tmp/rd1413-wamr-child-fds-%d.txt", (int)getppid());
        out = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
        if (out >= 0) {
            for (i = 0; i < count; i++) {
                size_t len = strlen(lines[i]);
                (void)write(out, lines[i], len);
                (void)write(out, "\n", 1);
            }
            (void)close(out);
        }
        return 0;
    }
#else
    {
        wamr_vok_envelope_t ev;
        wamr_vok_wax_seal_t s;
        char ec[2048];
        char sc[2048];
        char env_text[4096];
        char seal_text[4096];
        char h[72];
        int el;
        int sl;
        memset(&ev, 0, sizeof ev);
        memset(&s, 0, sizeof s);
#if MODE == 7
        if (n > 0) {
            inbuf[n - 1] ^= 1u;
        }
#endif
        wamr_sha256(inbuf, n, ev.component_digest);
        wamr_vok_framed_digest(WAMR_VOK_POLICY_DOMAIN,
                               (const uint8_t *)WAMR_VOK_POLICY_ID,
                               strlen(WAMR_VOK_POLICY_ID), ev.policy_digest);
        wamr_vok_framed_digest(WAMR_VOK_CAPABILITY_DOMAIN,
                               (const uint8_t *)"none", 4,
                               ev.capability_digest);
        wamr_vok_framed_digest(WAMR_VOK_DEPS_DOMAIN, (const uint8_t *)"closed",
                               6, ev.dependency_digest);
        wamr_vok_framed_digest(WAMR_VOK_EVIDENCE_DOMAIN,
                               (const uint8_t *)"synthetic", 9,
                               ev.evidence_digest);
        memcpy(ev.abi, WAMR_VOK_ABI, strlen(WAMR_VOK_ABI) + 1);
        memcpy(ev.target, WAMR_VOK_TARGET, strlen(WAMR_VOK_TARGET) + 1);
        memcpy(ev.schema_version, "1", 2);
#if MODE == 23
        memcpy(ev.build_point,
               "git:0123456789ABCDEF0123456789ABCDEF01234567", 45);
#else
        memcpy(ev.build_point, "git:0123456789abcdef0123456789abcdef01234567",
               45);
#endif
        ev.epoch = 1;
        el = wamr_vok_envelope_canonical(&ev, ec, sizeof ec);
        if (el < 0) {
            return 9;
        }
        wamr_vok_framed_digest(WAMR_VOK_ENVELOPE_DOMAIN, (const uint8_t *)ec,
                               (size_t)el, ev.envelope_digest);
#if MODE == 6
        ev.envelope_digest[5] ^= 1u;
#endif
        memcpy(s.envelope_digest, ev.envelope_digest, 32);
        wamr_vok_framed_digest(WAMR_VOK_PROFILE_DOMAIN,
                               (const uint8_t *)WAMR_VOK_POLICY_ID,
                               strlen(WAMR_VOK_POLICY_ID), s.profile_digest);
        memcpy(s.kind, "WAX_SEAL", 9);
        memcpy(s.terminal_outcome, "VALID", 6);
        memcpy(s.authentication, WAMR_VOK_AUTHENTICATION,
               strlen(WAMR_VOK_AUTHENTICATION) + 1);
        memcpy(s.schema_version, "1", 2);
#if MODE == 5
        s.authorizing = 1;
#endif
        sl = wamr_vok_seal_canonical(&s, sc, sizeof sc);
        if (sl < 0) {
            return 9;
        }
        wamr_vok_framed_digest(WAMR_VOK_SEAL_DOMAIN, (const uint8_t *)sc,
                               (size_t)sl, s.seal_digest);
        hex_prefaced(ev.envelope_digest, h);
        (void)snprintf(env_text, sizeof env_text, "%senvelopeDigest=%s\n", ec,
                       h);
#if MODE == 4 || MODE == 11
        {
            char *p = strstr(env_text, "epoch=1\n");
            const char *repl =
#if MODE == 4
                "epoch=+1\n";
#else
                "epoch=-18446744073709551615\n";
#endif
            char tmp[8192];
            size_t head;
            size_t repl_len;
            size_t tail_len;
            if (p == NULL) {
                return 9;
            }
            head = (size_t)(p - env_text);
            repl_len = strlen(repl);
            tail_len = strlen(p + 8);
            if (head + repl_len + tail_len + 1u > sizeof(tmp) ||
                head + repl_len + tail_len + 1u > sizeof(env_text)) {
                return 9;
            }
            memcpy(tmp, env_text, head);
            memcpy(tmp + head, repl, repl_len);
            memcpy(tmp + head + repl_len, p + 8, tail_len + 1u);
            memcpy(env_text, tmp, head + repl_len + tail_len + 1u);
        }
#endif
        hex_prefaced(s.seal_digest, h);
        (void)snprintf(seal_text, sizeof seal_text, "%ssealDigest=%s\n", sc, h);
#if MODE == 22
        printf("GALERINA_VOK_VERDICT_V1\nENVELOPE 0%zu\n%sSEAL %zu\n%s",
               strlen(env_text), env_text, strlen(seal_text), seal_text);
#elif MODE == 27
        printf("GALERINA_VOK_VERDICT_V1\nENVELOPE +%zu\n%sSEAL %zu\n%s",
               strlen(env_text), env_text, strlen(seal_text), seal_text);
#elif MODE == 28
        printf("GALERINA_VOK_VERDICT_V1\nENVELOPE %zu\n%sSEAL 0%zu\n%s",
               strlen(env_text), env_text, strlen(seal_text), seal_text);
#else
        printf("GALERINA_VOK_VERDICT_V1\nENVELOPE %zu\n%sSEAL %zu\n%s",
               strlen(env_text), env_text, strlen(seal_text), seal_text);
#endif
#if MODE == 8
        printf("X");
#endif
        fflush(stdout);
#if MODE == 21
        (void)close(1);
        (void)close(2);
        sleep(8);
#endif
#if MODE == 9
        return 3;
#endif
        return 0;
    }
#endif
#endif
}
