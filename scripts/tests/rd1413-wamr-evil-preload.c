#define _GNU_SOURCE

#include <fcntl.h>
#include <stdlib.h>
#include <unistd.h>

__attribute__((constructor)) static void rd1413_preload_fire(void)
{
    const char *path = getenv("WAMR_VOK_PRELOAD_MARKER");
    int fd;

    if (path == NULL || path[0] == '\0') {
        return;
    }
    fd = open(path, O_CREAT | O_WRONLY, 0644);
    if (fd >= 0) {
        (void)close(fd);
    }
}
