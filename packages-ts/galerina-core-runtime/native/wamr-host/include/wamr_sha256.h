#ifndef GALERINA_WAMR_SHA256_H
#define GALERINA_WAMR_SHA256_H

#include <stddef.h>
#include <stdint.h>

/*
 * SHA-256 as specified by FIPS PUB 180-4 (August 2015), sections 4.1.2,
 * 4.2.2, 5.1.1, 5.3.3 and 6.2. Host-owned bytes only. Never logs the
 * preimage.
 */
void wamr_sha256(const uint8_t *data, size_t length, uint8_t out[32]);

#endif
