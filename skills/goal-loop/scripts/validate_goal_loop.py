#!/usr/bin/env python3
"""Read-only validation through the execution engine."""
import sys
from goal_loop_ctl import main

if __name__ == "__main__":
    raise SystemExit(main(["validate", *sys.argv[1:]]))
