"""Công cụ quản trị dòng lệnh.

    python -m backend.manage create-user "Shop Hoa" shop@example.com --credits 300
    python -m backend.manage confirm-deposit TXABC123
"""
import argparse

from backend.database import create_user, init_db
from backend.services.wallet import verify_and_credit_transaction


def main():
    parser = argparse.ArgumentParser(prog="python -m backend.manage")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("create-user", help="Tạo tài khoản và in API token")
    p.add_argument("name")
    p.add_argument("email")
    p.add_argument("--role", default="shop", choices=["shop", "koc", "shopper", "admin"])
    p.add_argument("--credits", type=int, default=0)

    p = sub.add_parser("confirm-deposit", help="Xác nhận đã nhận tiền cho một giao dịch nạp")
    p.add_argument("transaction_id")

    args = parser.parse_args()
    init_db()
    if args.cmd == "create-user":
        user = create_user(args.name, args.email, args.role, args.credits)
        print(f"Đã tạo {user['id']} ({user['role']}).")
        print(f"API token (chỉ hiện một lần, hãy lưu lại): {user['api_token']}")
    else:
        print(verify_and_credit_transaction(args.transaction_id))


if __name__ == "__main__":
    main()
