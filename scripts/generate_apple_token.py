import jwt
import time
import argparse

def generate_token(team_id, key_id, private_key_path):
    # Apple Music Token expires after 6 months max. We set it to 1 month here.
    time_now = int(time.time())
    time_expired = time_now + (86400 * 30) # 30 days

    headers = {
        "alg": "ES256",
        "kid": key_id
    }

    payload = {
        "iss": team_id,
        "iat": time_now,
        "exp": time_expired
    }

    with open(private_key_path, 'r') as f:
        private_key = f.read()

    token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
    return token

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--team_id", help="Apple Team ID")
    parser.add_argument("--key_id", help="Key ID")
    parser.add_argument("--key_path", help="Path to .p8 file")
    args = parser.parse_args()

    if args.team_id and args.key_id and args.key_path:
        # Automated mode
        try:
            token = generate_token(args.team_id, args.key_id, args.key_path)
            print(token)
        except Exception as e:
            print(f"Error: {e}")
            exit(1)
    else:
        # Interactive mode
        print("--- Apple Music Developer Token Generator ---")
        team_id = input("Enter your Apple Team ID (10-character, e.g., A1B2C3D4E5): ").strip()
        key_id = input("Enter your Key ID (10-character, e.g., K1K2K3K4K5): ").strip()
        key_path = input("Enter path to your .p8 file (e.g., AuthKey_K1K2K3K4K5.p8): ").strip()

        try:
            token = generate_token(team_id, key_id, key_path)
            print("\n\nSUCCESS! Here is your VITE_APPLE_DEVELOPER_TOKEN:\n")
            print(token)
            print("\n\nCopy the string above and paste it into apps/web/.env")
        except Exception as e:
            print(f"\nError: {e}")
