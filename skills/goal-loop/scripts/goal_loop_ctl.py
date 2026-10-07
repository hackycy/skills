#!/usr/bin/env python3
"""Goal Loop command-line interface. State rules live in engine."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine.common import GoalError
from engine.service import Service


def mutation(parser):
    parser.add_argument("--expected-revision", type=int, required=True)


def build_parser():
    parser = argparse.ArgumentParser(description="Compile, execute and inspect Goal Loop contracts")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("bootstrap", "status", "context", "validate", "recover", "pass-gate"):
        p = sub.add_parser(name)
        p.add_argument("effort", type=Path)
        if name in {"recover", "pass-gate"}:
            mutation(p)
    checks = sub.add_parser("check").add_subparsers(dest="action", required=True)
    for name in ("start", "finish", "run", "cancel"):
        p = checks.add_parser(name)
        p.add_argument("effort", type=Path)
        mutation(p)
        if name in {"start", "run"}:
            p.add_argument("--check", required=True)
        else:
            p.add_argument("--attempt", required=True)
        if name == "start":
            p.add_argument("--subject", required=True)
        elif name == "finish":
            p.add_argument("--outcome", choices=["pass", "fail"], required=True)
            p.add_argument("--result", required=True)
        elif name == "cancel":
            p.add_argument("--reason", required=True)
    p = sub.add_parser("revise-contract")
    p.add_argument("effort", type=Path)
    p.add_argument("--plan", type=Path, required=True)
    p.add_argument("--mode", choices=["equivalent", "revalidate"], required=True)
    p.add_argument("--reason", required=True)
    p.add_argument("--from-gate")
    p.add_argument("--preview-digest", help="omit for read-only preview; supply the returned digest to commit")
    p.add_argument("--expected-revision", type=int)
    p = sub.add_parser("record")
    p.add_argument("effort", type=Path)
    mutation(p)
    p.add_argument("--kind", choices=["slice", "checkpoint", "failure", "rollback"], required=True)
    p.add_argument("--result", required=True)
    p.add_argument("--next-action", required=True)
    p.add_argument("--last-completed-slice")
    p.add_argument("--current-slice")
    p.add_argument("--risk", action="append", default=[])
    for name in ("block", "resume"):
        p = sub.add_parser(name)
        p.add_argument("effort", type=Path)
        mutation(p)
        p.add_argument("--reason", required=True)
        p.add_argument("--next-action", required=True)
        if name == "block":
            p.add_argument("--condition", required=True)
    p = sub.add_parser("correct")
    p.add_argument("effort", type=Path)
    mutation(p)
    p.add_argument("--commit", type=int, required=True)
    p.add_argument("--reason", required=True)
    p.add_argument("--revoke-attempt")
    return parser


def dispatch(args):
    service = Service(args.effort)
    cmd = args.command
    if cmd == "bootstrap":
        return service.bootstrap()
    if cmd in {"status", "context"}:
        return service.status(context=cmd == "context")
    if cmd == "validate":
        return service.validate()
    if cmd == "recover":
        return service.recover(args.expected_revision)
    if cmd == "pass-gate":
        return service.pass_gate(args.expected_revision)
    if cmd == "check":
        if args.action == "start":
            return service.start(args.expected_revision, args.check, args.subject)
        if args.action == "finish":
            return service.finish(args.expected_revision, args.attempt, args.outcome, args.result)
        if args.action == "cancel":
            return service.cancel(args.expected_revision, args.attempt, args.reason)
        return service.run(args.expected_revision, args.check)
    if cmd == "revise-contract":
        return service.revise(args.plan, args.mode, args.reason, expected=args.expected_revision, preview=args.preview_digest, from_gate=args.from_gate)
    if cmd == "record":
        event = {"type": "recorded", "kind": args.kind, "result": args.result, "next_action": args.next_action, "risks": args.risk}
        for key in ("last_completed_slice", "current_slice"):
            if getattr(args, key) is not None:
                event[key] = getattr(args, key)
        return service.mutate(args.expected_revision, event)
    if cmd in {"block", "resume"}:
        event = {"type": "blocked" if cmd == "block" else "resumed", "reason": args.reason, "next_action": args.next_action}
        if cmd == "block":
            event["condition"] = args.condition
        return service.mutate(args.expected_revision, event)
    return service.mutate(args.expected_revision, {"type": "corrected", "commit": args.commit, "reason": args.reason, "attempt_id": args.revoke_attempt}, allow_drift=True)


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        result = dispatch(args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.command == "validate" and not result["valid"]:
            return 1
        if args.command == "check" and args.action in {"finish", "run"} and result.get("status") != "pass":
            return 2
        return 0
    except (GoalError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
