#!/usr/bin/env python3
"""suite 48 crashcell (copy of the Grok scratch harness tf1-crashcell): ALICE-style crash-state harness (strace record + SIGKILL injection + power-loss replay).
Synthetic single-winner cell: Absent -> Reserved -> Committed. Recovery classifies Absent | Indeterminate | Committed.
Backends: sqlite (WAL, synchronous=FULL), file (O_EXCL reserve + tmp write+fsync+rename+dir fsync),
file-nosync (negative control: no fsync, no dir fsync; must show violations under power loss).
Synthetic 32-byte payload only."""
import os, sys, re, shutil, sqlite3, subprocess, json
PAY = bytes(range(32))
def fsync_dir(d):
    fd = os.open(d, os.O_RDONLY); os.fsync(fd); os.close(fd)
def worker(mode, d):
    if mode == "sqlite":
        c = sqlite3.connect(os.path.join(d, "cell.db"), isolation_level=None)
        c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=FULL")
        c.execute("CREATE TABLE IF NOT EXISTS cell(id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL, payload BLOB NOT NULL)")
        try:
            c.execute("BEGIN IMMEDIATE"); c.execute("INSERT INTO cell VALUES(1,'Reserved',?)", (PAY,)); c.execute("COMMIT")
        except sqlite3.IntegrityError:
            c.execute("ROLLBACK"); print("LOST", flush=True); return
        print("RESERVED", flush=True)
        c.execute("BEGIN IMMEDIATE"); n = c.execute("UPDATE cell SET state='Committed' WHERE id=1 AND state='Reserved'").rowcount; c.execute("COMMIT")
        print("ACK" if n == 1 else "LOST", flush=True); return
    sync = mode == "file"
    try:
        fd = os.open(os.path.join(d, "cell.reserved"), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print("LOST", flush=True); return
    os.write(fd, b"Reserved:" + PAY)
    if sync: os.fsync(fd)
    os.close(fd)
    if sync: fsync_dir(d)
    print("RESERVED", flush=True)
    fd = os.open(os.path.join(d, "cell.tmp"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, b"Committed:" + PAY)
    if sync: os.fsync(fd)
    os.close(fd); os.rename(os.path.join(d, "cell.tmp"), os.path.join(d, "cell"))
    if sync: fsync_dir(d)
    print("ACK", flush=True)
def recover(mode, d):
    if mode == "sqlite":
        p = os.path.join(d, "cell.db")
        if not os.path.exists(p): return "Absent"
        try:
            c = sqlite3.connect(p); ok = c.execute("PRAGMA integrity_check").fetchone()[0]
            if ok != "ok": return "CORRUPT"
            t = c.execute("SELECT name FROM sqlite_master WHERE name='cell'").fetchone()
            if not t: return "Absent"
            r = c.execute("SELECT state,payload FROM cell WHERE id=1").fetchone(); c.close()
        except sqlite3.DatabaseError as e:
            return "CORRUPT"
        if r is None: return "Absent"
        if r[1] != PAY: return "TORN"
        return {"Reserved": "Indeterminate", "Committed": "Committed"}.get(r[0], "TORN")
    cp, rp = os.path.join(d, "cell"), os.path.join(d, "cell.reserved")
    if os.path.exists(cp):
        return "Committed" if open(cp, "rb").read() == b"Committed:" + PAY else "TORN"
    if os.path.exists(rp):
        b = open(rp, "rb").read()
        return "Indeterminate" if b == b"Reserved:" + PAY else ("TORN" if b else "Indeterminate-Empty")
    return "Absent"
FD = re.compile(r'^(\w+)\((\d+)<([^>]*)>')
def powerloss(d, log):
    """Apply a power-loss model from a strace -yy log: unsynced data truncated, unsynced dir ops reverted."""
    written, synced, dirsynced_names, renames, created = {}, {}, None, [], []
    for line in open(log, errors="replace"):
        line = re.sub(r'^\d+\s+', '', line)
        m = FD.match(line)
        if m:
            call, path = m.group(1), m.group(3)
            if call in ("write", "pwrite64"):
                rm = re.search(r',\s*(\d+)(?:,\s*(\d+))?\)\s*=\s*(\d+)', line)
                if rm:
                    n = int(rm.group(3)); off = int(rm.group(2)) if (call == "pwrite64" and rm.group(2)) else written.get(path, 0)
                    written[path] = max(written.get(path, 0), off + n)
            elif call in ("fsync", "fdatasync") and line.rstrip().endswith("= 0"):
                if os.path.isdir(path) or path == d: dirsynced_names = (list(renames), list(created))
                else: synced[path] = written.get(path, 0)
        rm = re.match(r'^rename(?:at2?)?\(.*?"([^"]+)".*?"([^"]+)"', line)
        if rm and "= 0" in line: renames.append((rm.group(1), rm.group(2)))
        om = re.match(r'^openat\(.*?"([^"]+)",[^)]*O_CREAT', line)
        if om and not line.rstrip().endswith("-1"):
            created.append(om.group(1))
    dr = dirsynced_names[0] if dirsynced_names else []
    dc = dirsynced_names[1] if dirsynced_names else []
    for a, b in reversed(renames):  # unsynced renames revert
        if (a, b) not in dr:
            A, B = (a if os.path.isabs(a) else os.path.join(d, a)), (b if os.path.isabs(b) else os.path.join(d, b))
            if os.path.exists(B): os.rename(B, A)
    for name in os.listdir(d):
        p = os.path.join(d, name)
        if not os.path.isfile(p): continue
        rp = os.path.realpath(p)
        keep = synced.get(rp, synced.get(p))
        made_here = any(os.path.basename(x) == name for x in created)
        if made_here and not any(os.path.basename(x) == name for x in dc) and keep is None:
            os.remove(p); continue   # created, never synced, dir never synced -> entry may vanish
        if keep is not None and os.path.getsize(p) > keep:
            with open(p, "r+b") as f: f.truncate(keep)
        elif keep is None and name.endswith("-wal"):
            with open(p, "r+b") as f: f.truncate(0)
def run(mode, base, inj=None, plos=False):
    d = os.path.join(base, "cell"); os.makedirs(d, exist_ok=True)
    log = os.path.join(base, "trace.log")
    cmd = ["strace", "-f", "-qq", "-yy", "-o", log, "-e", "trace=openat,write,pwrite64,fsync,fdatasync,rename,renameat,renameat2"]
    if inj: cmd += ["-e", "inject=%s:signal=KILL:when=%d" % inj]
    cmd += [sys.executable, os.path.abspath(__file__), "worker", mode, d]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout.split()
    if plos: powerloss(d, log)
    st = recover(mode, d)
    cont = subprocess.run([sys.executable, os.path.abspath(__file__), "worker", mode, d], capture_output=True, text=True).stdout.split()
    return out, st, cont
def check(out, st, cont):
    v = []
    if st == "Indeterminate-Empty": st = "Indeterminate"  # O_EXCL entry exists: the reservation is the name, content not yet written
    if st not in ("Absent", "Indeterminate", "Committed"): v.append("STATE_" + st)
    if "ACK" in out and st != "Committed": v.append("ACK_LOST")
    if "RESERVED" in out and st == "Absent": v.append("RESERVATION_LOST")
    won = "RESERVED" in cont
    if st != "Absent" and won: v.append("SECOND_WINNER")
    return v
def campaign(mode, root):
    base0 = os.path.join(root, mode + "-clean"); out, st, cont = run(mode, base0)
    counts = {}
    for line in open(os.path.join(base0, "trace.log"), errors="replace"):
        m = re.match(r'^(?:\d+\s+)?(\w+)\(', line)
        if m and m.group(1) in ("write", "pwrite64", "fsync", "fdatasync", "rename", "renameat", "renameat2"): counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    res = {"mode": mode, "clean": [out, st, check(out, st, cont)], "points": 0, "violations": [], "states": {}}
    for plos in (False, True):
        for sc, n in counts.items():
            for k in range(1, n + 2):
                b = os.path.join(root, "%s-%s-%d-%s" % (mode, sc, k, "pl" if plos else "pc"))
                out, st, cont = run(mode, b, (sc, k), plos); res["points"] += 1
                key = ("pl:" if plos else "pc:") + st; res["states"][key] = res["states"].get(key, 0) + 1
                v = check(out, st, cont)
                if v: res["violations"].append({"inject": sc + "@" + str(k), "powerloss": plos, "out": out, "state": st, "v": v})
        b = os.path.join(root, "%s-postack-%s" % (mode, "pl" if plos else "pc")); out, st, cont = run(mode, b, None, plos); res["points"] += 1
        v = check(out, st, cont)
        if v: res["violations"].append({"inject": "post-ack", "powerloss": plos, "out": out, "state": st, "v": v})
    res["syscalls"] = counts
    return res
if __name__ == "__main__":
    if sys.argv[1] == "worker": worker(sys.argv[2], sys.argv[3]); sys.exit(0)
    root = sys.argv[2]; os.makedirs(root, exist_ok=True)
    r = campaign(sys.argv[1], root)
    print("CRASHCELL " + json.dumps({k: r[k] for k in ("mode", "points", "syscalls", "states", "clean")}))
    print("CRASHCELL_VIOLATIONS %s %d %s" % (r["mode"], len(r["violations"]), json.dumps(r["violations"][:6])))