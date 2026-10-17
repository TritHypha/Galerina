/* Host-side harness for the pinned forging stub. Opens a leak fd without
 * CLOEXEC, calls wamr_vok_spawn_and_bind, and checks rc / elapsed / fds. */
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "wamr_vok_verdict.h"

static int check_fd_list(void)
{
    char path[128];
    char line[32];
    FILE *f;
    int saw0 = 0;
    int saw1 = 0;
    int saw2 = 0;
    int extra = 0;

    (void)snprintf(path, sizeof(path), "/tmp/rd1413-wamr-child-fds-%d.txt",
                   (int)getpid());
    f = fopen(path, "r");
    if (f == NULL) {
        fprintf(stderr, "fd-list file missing: %s\n", path);
        return 0;
    }
    while (fgets(line, sizeof(line), f) != NULL) {
        int fd = -1;
        if (sscanf(line, "%d", &fd) != 1) {
            extra = 1;
            break;
        }
        if (fd == 0) {
            saw0 = 1;
        } else if (fd == 1) {
            saw1 = 1;
        } else if (fd == 2) {
            saw2 = 1;
        } else {
            extra = 1;
            fprintf(stderr, "child inherited extra fd %d\n", fd);
            break;
        }
    }
    fclose(f);
    (void)unlink(path);
    if (extra || !saw0 || !saw1 || !saw2) {
        fprintf(stderr, "fd-list expected only 0/1/2 (saw0=%d saw1=%d saw2=%d extra=%d)\n",
                saw0, saw1, saw2, extra);
        return 0;
    }
    return 1;
}

int main(int argc, char **argv)
{
    size_t n;
    uint8_t *b;
    int leak;
    struct timespec t0;
    struct timespec t1;
    wamr_vok_envelope_t e;
    wamr_vok_wax_seal_t s;
    int rc;
    long ms;
    int expected_rc;
    long max_ms;
    int fdcheck;

    if (argc != 6) {
        fprintf(stderr,
                "usage: forging-harness stub_path nbytes expected_rc max_ms fdcheck\n");
        return 2;
    }
    n = (size_t)strtoull(argv[2], NULL, 10);
    expected_rc = atoi(argv[3]);
    max_ms = strtol(argv[4], NULL, 10);
    fdcheck = atoi(argv[5]);
    if (n == 0 || n > (4u * 1024u * 1024u)) {
        return 2;
    }
    b = (uint8_t *)malloc(n);
    if (b == NULL) {
        return 2;
    }
    memset(b, 0x41, n);
    b[0] = 0;
    b[1] = 'a';
    b[2] = 's';
    b[3] = 'm';
    leak = open("/etc/hostname", O_RDONLY);
    if (clock_gettime(CLOCK_MONOTONIC, &t0) != 0) {
        free(b);
        return 2;
    }
    rc = wamr_vok_spawn_and_bind(argv[1], b, n, &e, &s);
    if (clock_gettime(CLOCK_MONOTONIC, &t1) != 0) {
        free(b);
        return 2;
    }
    ms = (t1.tv_sec - t0.tv_sec) * 1000L +
         (t1.tv_nsec - t0.tv_nsec) / 1000000L;
    printf("RC=%d ELAPSED_MS=%ld LEAKFD=%d\n", rc, ms, leak);
    fflush(stdout);
    free(b);
    if (rc != expected_rc) {
        fprintf(stderr, "expected rc %d got %d\n", expected_rc, rc);
        return 1;
    }
    if (max_ms > 0 && ms > max_ms) {
        fprintf(stderr, "elapsed %ld ms exceeds %ld ms\n", ms, max_ms);
        return 1;
    }
    if (fdcheck && !check_fd_list()) {
        return 1;
    }
    return 0;
}
