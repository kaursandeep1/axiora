from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta
import json
import re
import secrets

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up templates
templates = Jinja2Templates(directory="templates")

# Data storage (same as before)
rooms = {}
invite_tokens = {}
rate_limits = {}

# Helper functions (same as before)
def is_valid_username(username):
    return 3 <= len(username) <= 20 and re.match(r'^[a-zA-Z0-9\s]+$', username)

def check_rate_limit(websocket):
    now = datetime.now()
    if websocket not in rate_limits:
        rate_limits[websocket] = {"count": 1, "reset_time": now + timedelta(seconds=10)}
        return True
    
    limit = rate_limits[websocket]
    if now > limit["reset_time"]:
        limit["count"] = 1
        limit["reset_time"] = now + timedelta(seconds=10)
        return True
    
    if limit["count"] >= 5:
        return False
    
    limit["count"] += 1
    return True

@app.get("/")
async def get_home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/room/{room_code}")
async def get_room(request: Request, room_code: str, username: str, pin: str = None, token: str = None):
    # Check invite token if provided
    if token:
        if token not in invite_tokens or invite_tokens[token] != room_code:
            return HTMLResponse("""
            <!DOCTYPE html>
            <html>
            <head><title>Invalid Token</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: red;">❌ Invalid Invite Token</h1>
                <a href="/">← Go Back</a>
            </body>
            </html>
            """)
    
    # Check PIN if room exists
    if room_code in rooms and rooms[room_code].get("pin"):
        if pin != rooms[room_code]["pin"]:
            return HTMLResponse("""
            <!DOCTYPE html>
            <html>
            <head><title>Access Denied</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: red;">🔒 Incorrect PIN</h1>
                <a href="/">← Go Back</a>
            </body>
            </html>
            """)
    
    # Check if room exists, if not, create it
    is_owner = False
    if room_code not in rooms:
        rooms[room_code] = {
            "owner": username,
            "members": {},
            "messages": [],
            "muted": {},
            "pin": pin if pin else None
        }
        is_owner = True
        invite_token = secrets.token_hex(8)
        invite_tokens[invite_token] = room_code
    else:
        is_owner = (rooms[room_code]["owner"] == username)
        invite_token = secrets.token_hex(8)
        invite_tokens[invite_token] = room_code
    
    pin_status = "🔒 PIN Protected" if rooms[room_code].get("pin") else "🔓 Open Room"
    owner_status = "👑 Room Owner" if is_owner else "👤 Member"
    room_owner = rooms[room_code]["owner"]
    pin_protected = rooms[room_code].get("pin") is not None
    
    return templates.TemplateResponse("room.html", {
        "request": request,
        "room_code": room_code,
        "username": username,
        "pin_status": pin_status,
        "owner_status": owner_status,
        "is_owner": is_owner,
        "pin_protected": pin_protected,
        "invite_token": invite_token,
        "room_owner": room_owner
    })

# WebSocket endpoint (same as before - keep all the WebSocket code)
@app.websocket("/ws/{room_code}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, username: str):
    await websocket.accept()
    
    if room_code not in rooms:
        await websocket.close()
        return
    
    room = rooms[room_code]
    
    if username in room["muted"] and datetime.now() < room["muted"][username]:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "You are muted!"
        }))
        await websocket.close()
        return
    
    room["members"][websocket] = username
    await broadcast_to_room(room_code, None, f"✨ {username} joined the chat!", "system")
    await update_members_list(room_code)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if not check_rate_limit(websocket):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "⚠️ Slow down! You're sending too many messages."
                }))
                continue
            
            if username in room["muted"]:
                mute_until = room["muted"][username]
                if datetime.now() < mute_until:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"You are muted until {mute_until.strftime('%H:%M:%S')}"
                    }))
                    continue
            
            if message_data["type"] == "message":
                if len(message_data["content"]) > 500:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "Message too long (max 500 chars)"
                    }))
                    continue
                
                await broadcast_to_room(room_code, username, message_data["content"], "message")
                
            elif message_data["type"] == "mute" and room["owner"] == username:
                target_user = message_data["username"]
                if target_user in room["members"].values():
                    if message_data["mute"]:
                        room["muted"][target_user] = datetime.now() + timedelta(minutes=5)
                        await broadcast_to_room(room_code, None, f"🔇 {target_user} was muted for 5 minutes", "system")
                    else:
                        if target_user in room["muted"]:
                            del room["muted"][target_user]
                            await broadcast_to_room(room_code, None, f"🔊 {target_user} was unmuted", "system")
                    await update_members_list(room_code)
                    
            elif message_data["type"] == "remove" and room["owner"] == username:
                target_user = message_data["username"]
                target_ws = None
                for ws, user in room["members"].items():
                    if user == target_user:
                        target_ws = ws
                        break
                if target_ws:
                    await target_ws.send_text(json.dumps({
                        "type": "error",
                        "message": "You were removed from the room by the owner"
                    }))
                    await target_ws.close()
                    await broadcast_to_room(room_code, None, f"❌ {target_user} was removed from the room", "system")
                    await update_members_list(room_code)
                    
    except WebSocketDisconnect:
        if websocket in room["members"]:
            del room["members"][websocket]
            await broadcast_to_room(room_code, None, f"👋 {username} left the chat", "system")
            await update_members_list(room_code)
            
            if len(room["members"]) == 0 and room_code in rooms:
                del rooms[room_code]

async def broadcast_to_room(room_code: str, username: str, message: str, msg_type: str):
    if room_code in rooms:
        room = rooms[room_code]
        timestamp = datetime.now().isoformat()
        
        for connection in room["members"]:
            try:
                if msg_type == "message":
                    await connection.send_text(json.dumps({
                        "type": "message",
                        "username": username,
                        "message": message,
                        "timestamp": timestamp
                    }))
                elif msg_type == "system":
                    await connection.send_text(json.dumps({
                        "type": "system",
                        "message": message
                    }))
            except:
                pass

async def update_members_list(room_code: str):
    if room_code in rooms:
        room = rooms[room_code]
        members_list = {user: True for user in room["members"].values()}
        muted_list = list(room["muted"].keys())
        
        for connection in room["members"]:
            try:
                await connection.send_text(json.dumps({
                    "type": "members_update",
                    "members": members_list,
                    "muted": muted_list
                }))
            except:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)