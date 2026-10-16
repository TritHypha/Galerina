#ifndef GALERINA_WAMR_VOK_HANDLE_H
#define GALERINA_WAMR_VOK_HANDLE_H

#include "wamr_secrets_gateway_host.h"
#include "vok_authority_handoff.h"

/*
 * Issues a process-local VOK opaque handle from a VALID loaded snapshot.
 * The digest never leaves this glue toward the composed-probe caller.
 * Link only from the WAMR→VOK composed probe, not the load-path probe.
 */
int wamr_secrets_gateway_issue_vok_handle(
    const wamr_secrets_gateway_loaded_t *loaded,
    vok_wamr_loaded_handle_t *out);

#endif
