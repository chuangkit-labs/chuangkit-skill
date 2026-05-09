#!/usr/bin/env python3
import argparse

from _common import dump, pick, request_json, unwrap_response


def main():
    parser = argparse.ArgumentParser(description="Switch the current Chuangkit Agent Canvas design.")
    parser.add_argument("--design-id", help="Existing design_id. Omit to create and switch to a new design.")
    args = parser.parse_args()

    payload = {}
    if args.design_id:
        payload["design_id"] = args.design_id

    data = unwrap_response(request_json("/api/agent_skill/designs/switch.do", payload))
    dump(pick(data, "design_id", "design_url", "created"))


if __name__ == "__main__":
    main()
