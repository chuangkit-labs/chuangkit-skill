#!/usr/bin/env python3
import argparse

from _common import dump, get_any, pick, request_json, unwrap_response


def simplify_task(task):
    return pick(
        task,
        "task_id",
        "taskId",
        "state",
        "status",
        "image_url",
        "imageUrl",
        "no_water_mark_image_url",
        "noWaterMarkImageUrl",
        "legal_watermark_image_url",
        "legalWatermarkImageUrl",
        "video_url",
        "videoUrl",
    )


def simplify_message(message):
    item = pick(
        message,
        "message_id",
        "messageId",
        "role",
        "content",
        "content_type",
        "contentType",
        "create_time",
        "createTime",
        "request_id",
        "requestId",
    )
    tasks = get_any(message, "tasks") or {}
    task_list = get_any(tasks, "list") or []
    if task_list:
        item["tasks"] = [simplify_task(task) for task in task_list if simplify_task(task)]
    return item


def main():
    parser = argparse.ArgumentParser(description="Query Chuangkit Agent Skill request status by request_id.")
    parser.add_argument("--request-id", required=True, help="request_id returned by send_message.py.")
    parser.add_argument("--last-message-id", help="Cursor returned as next_last_message_id.")
    parser.add_argument("--after-seq", help="Alias for --last-message-id; uses Mongo ObjectId cursor.")
    parser.add_argument("--page-size", type=int, default=20, help="Message page size.")
    args = parser.parse_args()

    payload = {
        "request_id": args.request_id,
        "page_size": args.page_size,
    }
    cursor = args.last_message_id or args.after_seq
    if cursor:
        payload["last_message_id"] = cursor

    data = unwrap_response(request_json("/api/agent_skill/requests/status.do", payload))
    dump({
        **pick(data, "request_id", "requestId", "session_id", "sessionId", "next_last_message_id", "nextLastMessageId", "has_more", "hasMore", "finished", "error"),
        "messages": [simplify_message(message) for message in (data.get("messages") or [])],
    })


if __name__ == "__main__":
    main()
