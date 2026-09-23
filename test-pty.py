import pty, os, time, select, sys

master, slave = pty.openpty()
pid = os.fork()

if pid == 0:
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    if slave > 2: os.close(slave)
    os.close(master)
    os.execlp('sword', 'sword')
else:
    os.close(slave)
    while True:
        r, w, e = select.select([master, sys.stdin], [], [])
        if master in r:
            try:
                chunk = os.read(master, 1024)
                if not chunk: break
                os.write(1, chunk)
            except OSError:
                break
        if sys.stdin in r:
            chunk = os.read(0, 1024)
            if not chunk: break
            os.write(master, chunk)
