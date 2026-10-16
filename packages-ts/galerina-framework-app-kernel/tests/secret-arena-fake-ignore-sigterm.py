#!/usr/bin/env python3
"""SIGTERM-ignoring SecretArena custodian fake. Synthetic protocol only."""
import os
import signal
import tempfile
import time

MARK = os.path.join(tempfile.gettempdir(), "galerina-secret-arena-ignore-sigterm.mark")


def mark(line):
    with open(MARK, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def on_term(_signum, _frame):
    mark("sigterm:%s" % os.getpid())


signal.signal(signal.SIGTERM, on_term)
with open(MARK, "w", encoding="utf-8") as handle:
    handle.write("pid:%s\n" % os.getpid())


def read_exact(n):
    buf = bytearray()
    while len(buf) < n:
        chunk = os.read(0, n - len(buf))
        if not chunk:
            hang()
        buf.extend(chunk)
    return bytes(buf)


def write_frame(payload):
    os.write(1, len(payload).to_bytes(4, "big") + payload)


def hang():
    while True:
        time.sleep(3600)


hello = read_exact(4)
hello_len = int.from_bytes(hello, "big")
if hello_len > 0:
    read_exact(hello_len)
write_frame(bytes([0, 0]))
get_header = read_exact(4)
get_len = int.from_bytes(get_header, "big")
if get_len > 0:
    read_exact(get_len)
hang()
