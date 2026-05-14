import json, urllib.request, urllib.parse

TOKEN = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a"
SCENARIO_ID = 4869898

ID_VERIFICATION_HTML = (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Georgia\',serif;">'
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;"><tr><td align="center">'
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1e1e1e;border-radius:4px;">'
    '<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;color:#c8902a;text-transform:uppercase;">Stack N Scale Enterprises</p>'
    '<h1 style="margin:0;font-size:28px;font-weight:400;color:#f5f0e8;letter-spacing:1px;">Identity Verification.</h1>'
    '</td></tr><tr><td style="padding:40px 48px;">'
    '<p style="margin:0 0 24px;font-size:16px;color:#c8b89a;line-height:1.8;">Dear {{1.name}},</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Welcome to Stack N Scale Enterprises. Your payment has been confirmed and your account is ready.</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">To complete your onboarding and unlock your private Discord channel, please submit your identity verification documents using the button below.</p>'
    '<p style="margin:0 0 32px;font-size:15px;color:#a09070;line-height:1.9;">The process takes under two minutes &mdash; you\'ll need a government-issued photo ID and a selfie holding it.</p>'
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 36px;">'
    '<a href="{{1.idVerificationUrl}}" style="display:inline-block;background:#c8902a;color:#0a0a0a;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:16px 40px;border-radius:2px;font-weight:600;">Complete Verification &rarr;</a>'
    '</td></tr></table>'
    '<p style="margin:0 0 4px;font-size:14px;color:#c8b89a;">Warm regards,</p>'
    '<p style="margin:0;font-size:14px;color:#c8902a;letter-spacing:1px;">Stack N Scale Enterprises</p>'
    '</td></tr><tr><td style="padding:24px 48px;border-top:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;color:#3a3a3a;letter-spacing:1px;">STACK N SCALE ENTERPRISES &nbsp;&middot;&nbsp; PRIVATE MEMBER CORRESPONDENCE</p>'
    '<a href="https://www.skool.com/elysium-sales-academy-7811/about?ref=69ad8597e9144b38b0ac045df7b96c3e" style="color:#c8902a;text-decoration:none;font-size:11px;letter-spacing:1px;font-family:\'Georgia\',serif;">stacknscale.com</a>'
    '</td></tr></table></td></tr></table></body></html>\r\n'
)

EMAIL_MODULE_EXPECT = [
    {"name": "to", "spec": {"name": "value", "type": "email", "label": "Recipient email address", "required": True, "validate": True}, "type": "array", "label": "To", "required": True},
    {"name": "subject", "type": "text", "label": "Subject"},
    {"name": "bodyType", "type": "select", "label": "Body type", "required": True, "validate": {"enum": ["rawHtml", "collection"]}},
    {"name": "attachments", "spec": {"name": "value", "spec": [{"name": "filename", "type": "filename", "label": "File name", "required": True, "semantic": "file:name"}, {"name": "data", "type": "buffer", "label": "Data", "required": True, "semantic": "file:data"}], "type": "collection", "label": "Attachment"}, "type": "array", "label": "Attachments"},
    {"name": "from", "type": "select", "label": "From"},
    {"name": "cc", "spec": {"name": "value", "type": "email", "label": "Recipient email address"}, "type": "array", "label": "CC recipients"},
    {"name": "bcc", "spec": {"name": "value", "type": "email", "label": "Recipient email address"}, "type": "array", "label": "BCC recipients"},
    {"name": "emailHeaders", "spec": {"name": "value", "spec": [{"name": "key", "type": "text", "label": "Key", "required": True}, {"name": "value", "type": "text", "label": "Value"}], "type": "collection", "label": "Email header"}, "type": "array", "label": "Additional email headers"},
    {"name": "content", "type": "text", "label": "Content"}
]

EMAIL_MODULE_RESTORE_BASE = {
    "expect": {"cc": {"mode": "chose"}, "to": {"mode": "chose", "items": [None]}, "bcc": {"mode": "chose"}, "from": {"mode": "chose"}, "bodyType": {"label": "Raw HTML"}, "attachments": {"mode": "chose"}, "emailHeaders": {"mode": "chose"}}
}

DISCORD_HTML = (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Georgia\',serif;">'
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;"><tr><td align="center">'
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1e1e1e;border-radius:4px;">'
    '<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;color:#c8902a;text-transform:uppercase;">Stack N Scale Enterprises</p>'
    '<h1 style="margin:0;font-size:28px;font-weight:400;color:#f5f0e8;letter-spacing:1px;">Discord.</h1>'
    '</td></tr><tr><td style="padding:40px 48px;">'
    '<p style="margin:0 0 24px;font-size:16px;color:#c8b89a;line-height:1.8;">Dear {{1.name}},</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your onboarding is complete. You\'re now cleared to join your private Discord channel and the Stack N Scale student community.</p>'
    '<p style="margin:0 0 32px;font-size:15px;color:#a09070;line-height:1.9;">Click below to connect your Discord account and gain immediate access:</p>'
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 36px;">'
    '<a href="{{1.discordOAuthUrl}}" style="display:inline-block;background:#c8902a;color:#0a0a0a;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:16px 40px;border-radius:2px;font-weight:600;">Connect Discord &rarr;</a>'
    '</td></tr></table>'
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td style="padding:20px 24px;background:#0f0f0f;border:1px solid #1e1e1e;border-radius:4px;">'
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#c8902a;text-transform:uppercase;">Your Resources</p>'
    '<p style="margin:0 0 12px;font-size:13px;color:#a09070;line-height:1.8;">Your personal client folder is ready in Google Drive.</p>'
    '<a href="{{1.driveFolderUrl}}" style="display:inline-block;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8902a;text-decoration:none;">View Your Folder &rarr;</a>'
    '</td></tr></table>'
    '<p style="margin:0 0 4px;font-size:14px;color:#c8b89a;">Warm regards,</p>'
    '<p style="margin:0;font-size:14px;color:#c8902a;letter-spacing:1px;">Stack N Scale Enterprises</p>'
    '</td></tr><tr><td style="padding:24px 48px;border-top:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;color:#3a3a3a;letter-spacing:1px;">STACK N SCALE ENTERPRISES &nbsp;&middot;&nbsp; PRIVATE MEMBER CORRESPONDENCE</p>'
    '<a href="https://www.skool.com/elysium-sales-academy-7811/about?ref=69ad8597e9144b38b0ac045df7b96c3e" style="color:#c8902a;text-decoration:none;font-size:11px;letter-spacing:1px;font-family:\'Georgia\',serif;">stacknscale.com</a>'
    '</td></tr></table></td></tr></table></body></html>\r\n'
)

FORM_RECEIVED_HTML = (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Georgia\',serif;">'
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;"><tr><td align="center">'
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1e1e1e;border-radius:4px;">'
    '<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;color:#c8902a;text-transform:uppercase;">Stack N Scale Enterprises</p>'
    '<h1 style="margin:0;font-size:28px;font-weight:400;color:#f5f0e8;letter-spacing:1px;">Received.</h1>'
    '</td></tr><tr><td style="padding:40px 48px;">'
    '<p style="margin:0 0 24px;font-size:16px;color:#c8b89a;line-height:1.8;">Dear {{1.name}},</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your onboarding questionnaire has been received and saved. Thank you for taking the time to complete it.</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">If you haven\'t already, please complete your identity verification to finalize your access.</p>'
    '<p style="margin:0 0 36px;font-size:15px;color:#a09070;line-height:1.9;">Our team will be in touch shortly.</p>'
    '<p style="margin:0 0 4px;font-size:14px;color:#c8b89a;">Warm regards,</p>'
    '<p style="margin:0;font-size:14px;color:#c8902a;letter-spacing:1px;">Stack N Scale Enterprises</p>'
    '</td></tr><tr><td style="padding:24px 48px;border-top:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;color:#3a3a3a;letter-spacing:1px;">STACK N SCALE ENTERPRISES &nbsp;&middot;&nbsp; PRIVATE MEMBER CORRESPONDENCE</p>'
    '<a href="https://www.skool.com/elysium-sales-academy-7811/about?ref=69ad8597e9144b38b0ac045df7b96c3e" style="color:#c8902a;text-decoration:none;font-size:11px;letter-spacing:1px;font-family:\'Georgia\',serif;">stacknscale.com</a>'
    '</td></tr></table></td></tr></table></body></html>\r\n'
)

ID_RECEIVED_HTML = (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#0a0a0a;font-family:\'Georgia\',serif;">'
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;"><tr><td align="center">'
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1e1e1e;border-radius:4px;">'
    '<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;color:#c8902a;text-transform:uppercase;">Stack N Scale Enterprises</p>'
    '<h1 style="margin:0;font-size:28px;font-weight:400;color:#f5f0e8;letter-spacing:1px;">Under Review.</h1>'
    '</td></tr><tr><td style="padding:40px 48px;">'
    '<p style="margin:0 0 24px;font-size:16px;color:#c8b89a;line-height:1.8;">Dear {{1.name}},</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your identity verification documents have been received and are now under review.</p>'
    '<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Once verified, you\'ll receive your Discord channel link to access the Stack N Scale community.</p>'
    '<p style="margin:0 0 36px;font-size:15px;color:#a09070;line-height:1.9;">If you have any questions in the meantime, our team is available.</p>'
    '<p style="margin:0 0 4px;font-size:14px;color:#c8b89a;">Warm regards,</p>'
    '<p style="margin:0;font-size:14px;color:#c8902a;letter-spacing:1px;">Stack N Scale Enterprises</p>'
    '</td></tr><tr><td style="padding:24px 48px;border-top:1px solid #1e1e1e;text-align:center;">'
    '<p style="margin:0 0 8px;font-size:11px;color:#3a3a3a;letter-spacing:1px;">STACK N SCALE ENTERPRISES &nbsp;&middot;&nbsp; PRIVATE MEMBER CORRESPONDENCE</p>'
    '<a href="https://www.skool.com/elysium-sales-academy-7811/about?ref=69ad8597e9144b38b0ac045df7b96c3e" style="color:#c8902a;text-decoration:none;font-size:11px;letter-spacing:1px;font-family:\'Georgia\',serif;">stacknscale.com</a>'
    '</td></tr></table></td></tr></table></body></html>\r\n'
)

blueprint = {
    "flow": [
        {
            "id": 1,
            "mapper": {},
            "module": "gateway:CustomWebHook",
            "version": 1,
            "metadata": {
                "restore": {"parameters": {"hook": {"data": {"editable": "true"}, "label": "SNS Email Hook"}}},
                "designer": {"x": -228, "y": 0},
                "interface": [
                    {"name": "type", "type": "text"},
                    {"name": "to", "type": "text"},
                    {"name": "name", "type": "text"},
                    {"name": "discordOAuthUrl", "type": "text"},
                    {"name": "driveFolderUrl", "type": "text"},
                    {"name": "idVerificationUrl", "type": "text"}
                ],
                "parameters": [
                    {"name": "hook", "type": "hook:gateway-webhook", "label": "Webhook", "required": True},
                    {"name": "maxResults", "type": "number", "label": "Maximum number of results"}
                ]
            },
            "parameters": {"hook": 2220417, "maxResults": 1}
        },
        {
            "id": 2,
            "mapper": None,
            "module": "builtin:BasicRouter",
            "routes": [
                {
                    "flow": [{
                        "id": 3,
                        "filter": {"name": "Discord Link", "conditions": [[{"a": "{{1.type}}", "b": "discord_link", "o": "text:equal"}]]},
                        "mapper": {"to": ["{{1.to}}"], "content": DISCORD_HTML, "subject": "Your Stack N Scale Discord Channel is Ready", "bodyType": "rawHtml"},
                        "module": "google-email:sendAnEmail",
                        "version": 4,
                        "metadata": {
                            "expect": EMAIL_MODULE_EXPECT,
                            "restore": {**EMAIL_MODULE_RESTORE_BASE, "parameters": {"__IMTCONN__": {"data": {"scoped": "true", "connection": "google-email"}, "label": "SNS Discord link (evan@stacknscale.co)"}}},
                            "designer": {"x": 342, "y": -186},
                            "parameters": [{"name": "__IMTCONN__", "type": "account:google-email", "label": "Connection", "required": True}]
                        },
                        "parameters": {"__IMTCONN__": 8574969}
                    }]
                },
                {
                    "flow": [{
                        "id": 4,
                        "filter": {"name": "Form Received", "conditions": [[{"a": "{{1.type}}", "b": "form_received", "o": "text:equal"}]]},
                        "mapper": {"to": ["{{1.to}}"], "content": FORM_RECEIVED_HTML, "subject": "We Received Your Onboarding Form — Stack N Scale Enterprises", "bodyType": "rawHtml"},
                        "module": "google-email:sendAnEmail",
                        "version": 4,
                        "metadata": {
                            "expect": EMAIL_MODULE_EXPECT,
                            "restore": {**EMAIL_MODULE_RESTORE_BASE, "parameters": {"__IMTCONN__": {"data": {"scoped": "true", "connection": "google-email"}, "label": "form received "}}},
                            "designer": {"x": 419, "y": 69},
                            "parameters": [{"name": "__IMTCONN__", "type": "account:google-email", "label": "Connection", "required": True}]
                        },
                        "parameters": {"__IMTCONN__": 8575284}
                    }]
                },
                {
                    "flow": [{
                        "id": 5,
                        "filter": {"name": "ID Received", "conditions": [[{"a": "{{1.type}}", "b": "id_received", "o": "text:equal"}]]},
                        "mapper": {"to": ["{{1.to}}"], "content": ID_RECEIVED_HTML, "subject": "ID Verification Received — Stack N Scale Enterprises", "bodyType": "rawHtml"},
                        "module": "google-email:sendAnEmail",
                        "version": 4,
                        "metadata": {
                            "expect": EMAIL_MODULE_EXPECT,
                            "restore": {**EMAIL_MODULE_RESTORE_BASE, "parameters": {"__IMTCONN__": {"data": {"scoped": "true", "connection": "google-email"}, "label": "id received "}}},
                            "designer": {"x": 100, "y": 277},
                            "parameters": [{"name": "__IMTCONN__", "type": "account:google-email", "label": "Connection", "required": True}]
                        },
                        "parameters": {"__IMTCONN__": 8575300}
                    }]
                },
                {
                    "flow": [{
                        "id": 6,
                        "filter": {"name": "ID Verification Request", "conditions": [[{"a": "{{1.type}}", "b": "id_verification_request", "o": "text:equal"}]]},
                        "mapper": {"to": ["{{1.to}}"], "content": ID_VERIFICATION_HTML, "subject": "Action Required: Complete Your Identity Verification — Stack N Scale", "bodyType": "rawHtml"},
                        "module": "google-email:sendAnEmail",
                        "version": 4,
                        "metadata": {
                            "expect": EMAIL_MODULE_EXPECT,
                            "restore": {**EMAIL_MODULE_RESTORE_BASE, "parameters": {"__IMTCONN__": {"data": {"scoped": "true", "connection": "google-email"}, "label": "id verification request"}}},
                            "designer": {"x": -200, "y": 420},
                            "parameters": [{"name": "__IMTCONN__", "type": "account:google-email", "label": "Connection", "required": True}]
                        },
                        "parameters": {"__IMTCONN__": 8575300}
                    }]
                }
            ],
            "version": 1,
            "metadata": {"designer": {"x": 112, "y": 0}}
        }
    ],
    "name": "SNS — Email Router",
    "metadata": {
        "instant": True,
        "version": 1,
        "designer": {
            "orphans": [],
            "samples": {
                "1": {
                    "to": "caelum123567@outlook.com",
                    "name": "Test Client",
                    "type": "discord_link",
                    "driveFolderUrl": "https://drive.google.com/drive/folders/test",
                    "discordOAuthUrl": "https://discord.com/oauth2/authorize?test=1",
                    "idVerificationUrl": "https://stack-n-scale.vercel.app/onboarding/id-submit?email=test%40test.com&name=Test+Client"
                }
            }
        },
        "scenario": {
            "dlq": False, "slots": None, "dataloss": False, "maxErrors": 3,
            "autoCommit": True, "roundtrips": 1, "sequential": False,
            "confidential": False, "freshVariables": False, "autoCommitTriggerLast": True
        }
    },
}

blueprint_str = json.dumps(blueprint)
payload = json.dumps({"blueprint": blueprint_str}).encode("utf-8")
url = f"https://us2.make.com/api/v2/scenarios/{SCENARIO_ID}"
req = urllib.request.Request(url, data=payload, method="PATCH")
req.add_header("Authorization", f"Token {TOKEN}")
req.add_header("Content-Type", "application/json")

try:
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        result = json.loads(body)
        print("SUCCESS")
        print(json.dumps(result, indent=2)[:800])
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"HTTP ERROR {e.code}:", body[:2000])
except Exception as ex:
    print("ERROR:", ex)
