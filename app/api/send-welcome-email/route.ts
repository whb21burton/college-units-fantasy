import { NextRequest, NextResponse } from 'next/server';

const welcomeHtml = (name: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to College Units Fantasy</title>
</head>
<body style="margin:0;padding:0;background:#05080f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#05080f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a1020,#05080f);border:1px solid #1e2d47;border-radius:12px 12px 0 0;padding:32px 32px 28px;text-align:center;">
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#4a5d7a;margin-bottom:16px;">College Units Fantasy</div>
              <h1 style="margin:0;font-size:28px;font-weight:900;letter-spacing:1px;color:#d4a828;text-transform:uppercase;line-height:1.1;">
                Welcome to<br/>College Units Fantasy
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0c1220;border-left:1px solid #1e2d47;border-right:1px solid #1e2d47;padding:32px;">
              <p style="margin:0 0 18px;font-size:16px;color:#e8edf5;line-height:1.6;">
                Hey ${name ? name : 'there'} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#7a90b0;line-height:1.7;">
                You're in. The 2026 college football season is coming and you're already ahead of the game.
                College Units Fantasy lets you draft real college football units — QB, RB, WR, TE, DEF, K —
                and score points based on their actual on-field performance every week.
              </p>

              <!-- What to do next -->
              <div style="background:#131d30;border:1px solid #1e2d47;border-radius:10px;padding:22px 24px;margin-bottom:28px;">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4a5d7a;margin-bottom:16px;">What to do next</div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;">
                      <span style="color:#2ecc71;font-size:15px;margin-right:10px;">✅</span>
                      <span style="font-size:14px;color:#e8edf5;">
                        <strong style="color:#d4a828;">Join our Discord</strong> — talk to the founder, get early access to features<br/>
                        <a href="https://discord.gg/5n7y9wh4D" style="color:#5865F2;font-size:12px;text-decoration:none;">discord.gg/5n7y9wh4D</a>
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;">
                      <span style="color:#2ecc71;font-size:15px;margin-right:10px;">✅</span>
                      <span style="font-size:14px;color:#e8edf5;">
                        <strong style="color:#d4a828;">Browse public leagues</strong> — find one to join or create your own<br/>
                        <a href="https://collegeunitsfantasy.com/leagues" style="color:#7a90b0;font-size:12px;text-decoration:none;">collegeunitsfantasy.com/leagues</a>
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;">
                      <span style="color:#2ecc71;font-size:15px;margin-right:10px;">✅</span>
                      <span style="font-size:14px;color:#e8edf5;">
                        <strong style="color:#d4a828;">Learn how scoring works</strong> — see how units earn fantasy points<br/>
                        <a href="https://collegeunitsfantasy.com" style="color:#7a90b0;font-size:12px;text-decoration:none;">collegeunitsfantasy.com</a>
                      </span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://collegeunitsfantasy.com"
                      style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#d4a828,#f0c94a);border-radius:8px;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#05080f;text-decoration:none;">
                      Go to My Account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#05080f;border:1px solid #1e2d47;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4a5d7a;letter-spacing:1px;">
                <a href="https://collegeunitsfantasy.com" style="color:#4a5d7a;text-decoration:none;">collegeunitsfantasy.com</a>
                &nbsp;·&nbsp;
                You're receiving this because you created an account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export async function POST(req: NextRequest) {
  const { email, name } = await req.json();

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'College Units Fantasy <welcome@collegeunitsfantasy.com>',
      to: email,
      subject: 'Welcome to College Units Fantasy 🏈',
      html: welcomeHtml(name ?? ''),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[send-welcome-email] Resend error:', res.status, body);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
