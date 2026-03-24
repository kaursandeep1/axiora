# ✨ Axiora - Real-time Chat Application

Axiora is a real-time, room-based chat application designed to deliver seamless and secure communication directly in the browser.

## 🚀 Features

- **Real-time messaging** using WebSockets
- **Unique 4-digit room-based communication**
- **Secure access** with optional PIN & invite tokens
- **Username validation** and room isolation
- **Owner-based moderation** (mute, remove users)
- **Anti-spam protection** with intelligent rate limiting
- **Responsive and modern UI design**
- **Messages appear on right (sent) and left (received)**

## 🛠️ Tech Stack

- **Backend:** FastAPI, Python
- **Real-time:** WebSockets
- **Frontend:** HTML, CSS, JavaScript
- **Templates:** Jinja2

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/kaursandeep1/axiora.git
cd axiora
pip install -r requirements.txt #Install dependencies
uvicorn main:app --reload #Run the application
http://localhost:8000 #Open your browser and visit
```

🎮 How to Use
1. Enter a 4-digit room code (e.g., 1234)

2. Choose a username (3-20 characters, letters & numbers only)

3. Set a PIN if you want to protect your room

4. Share the invite token with friends to join

5. The room creator becomes the owner and can:

    - Mute users for 5 minutes

    - Remove users from the room

🔒 Features
- Room PIN Protection: Set a password for your room

- Invite Tokens: Share unique tokens for easy access

- Rate Limiting: Prevents spam (5 messages per 10 seconds)

- User Muting: Owners can mute disruptive users

- User Removal: Owners can remove users from the room