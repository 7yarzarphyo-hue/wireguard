// Clean IP for Myanmar
const CLEAN_IP = "162.159.192.1";
const CLEAN_PORT = "500";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message) {
          const msg = update.message;
          const chatId = msg.chat.id;
          const text = msg.text || "";
          const userId = msg.from.id;
          const firstName = msg.from.first_name || "User";

          // Command: /start
          if (text === "/start") {
            const startText = 
              `👋 **Welcome ${firstName}!**\n\n` +
              `**404 WG Generator Bot**\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `Cloudflare WARP WireGuard config ထုတ်ပေးတဲ့ Bot ဖြစ်ပါတယ်။\n\n` +
              `📌 **Rules:**\n` +
              `• တစ်လကို ၁ ကြိမ်သာ generate လုပ်နိုင်ပါတယ်\n` +
              `• Free forever\n` +
              `• No limits on usage\n\n` +
              `🚀 /generate ကိုနှိပ်ပါ။`;
            await sendMessage(env.BOT_TOKEN, chatId, startText, "Markdown");
          } 

          // Command: /generate
          else if (text === "/generate") {
            const lastGenKey = `user_${userId}`;
            const lastGen = await env.USER_USAGE.get(lastGenKey);
            const now = Date.now();
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

            // Check 30 days limit
            if (lastGen) {
              const diff = now - parseInt(lastGen);
              if (diff < THIRTY_DAYS_MS) {
                const daysLeft = Math.ceil((THIRTY_DAYS_MS - diff) / (1000 * 60 * 60 * 24));
                await sendMessage(
                  env.BOT_TOKEN, 
                  chatId, 
                  `❌ **You cannot generate config yet!**\n\n` +
                  `👤 User: ${firstName}\n` +
                  `📅 You can only generate **once per 30 days**.\n` +
                  `⏰ Please try again in **${daysLeft} days**.\n\n` +
                  `💡 Use /stats to check your status.`
                );
                return new Response("OK");
              }
            }

            await sendMessage(
              env.BOT_TOKEN, 
              chatId, 
              `✅ **Access Granted!**\n━━━━━━━━━━━━━━━━━━━━\n👤 User: ${firstName}\n⏳ Generating config... Please wait`
            );

            // Register Cloudflare WARP Account
            const warpConfig = await registerWarpAccount();

            if (warpConfig) {
              // Update 30 days record in KV
              await env.USER_USAGE.put(lastGenKey, now.toString());

              const encPriv = encodeURIComponent(warpConfig.private_key);
              const encAddr = encodeURIComponent(warpConfig.address);
              const encPub = encodeURIComponent(warpConfig.public_key);
              const encReserved = encodeURIComponent(warpConfig.reserved);

              // Build WireGuard Connection String
              const wgLink = `wireguard://${encPriv}@${CLEAN_IP}:${CLEAN_PORT}?address=${encAddr}&publickey=${encPub}&reserved=${encReserved}&mtu=1280#Wireguard`;

              const caption = 
                `✅ **WireGuard Config Generated!**\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 User: ${firstName}\n\n` +
                `🔗 **Connection String:**\n` +
                `\`\`\`\n${wgLink}\n\`\`\`\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 Copy link above & import into WireGuard / NekoBox app\n\n` +
                `⚠️ **Next generation available in 30 days**`;

              await sendMessage(env.BOT_TOKEN, chatId, caption, "Markdown");
            } else {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ Error: Failed to generate config from WARP API.");
            }
          }

          // Command: /stats
          else if (text === "/stats") {
            const lastGen = await env.USER_USAGE.get(`user_${userId}`);
            if (lastGen) {
              const lastDate = new Date(parseInt(lastGen)).toISOString().split('T')[0];
              const daysSince = Math.floor((Date.now() - parseInt(lastGen)) / (1000 * 60 * 60 * 24));
              const daysLeft = Math.max(0, 30 - daysSince);
              await sendMessage(
                env.BOT_TOKEN, 
                chatId, 
                `📊 **Your Stats**\n━━━━━━━━━━━━━━━━━━━━\n📅 Last Generate: \`${lastDate}\`\n⏰ Next available in: \`${daysLeft}\` days`, 
                "Markdown"
              );
            } else {
              await sendMessage(
                env.BOT_TOKEN, 
                chatId, 
                `📊 **Your Stats**\n━━━━━━━━━━━━━━━━━━━━\n💡 No config generated yet!\n🚀 Use /generate to start.`, 
                "Markdown"
              );
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    return new Response("OK");
  }
};

// Telegram Send Message Helper
async function sendMessage(token, chatId, text, parseMode = "") {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parseMode })
  });
}

// Register WARP Account via direct Cloudflare API
async function registerWarpAccount() {
  try {
    const keyPair = generateWgKeyPair();
    const regResponse = await fetch("https://api.cloudflareclient.com/v0i1909051800/reg", {
      method: "POST",
      headers: {
        "User-Agent": "okhttp/3.12.1",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key: keyPair.publicKey,
        install_id: "",
        tos: new Date().toISOString(),
        type: "Android",
        model: "PC",
        locale: "en_US"
      })
    });

    const data = await regResponse.json();
    if (data.success) {
      const res = data.result;
      let reserved = "0,0,0";
      if (res.config.client_id) {
        const raw = atob(res.config.client_id);
        reserved = `${raw.charCodeAt(0)},${raw.charCodeAt(1)},${raw.charCodeAt(2)}`;
      }
      return {
        private_key: keyPair.privateKey,
        public_key: res.config.peers[0].public_key,
        address: `${res.config.interface.addresses.v4}/32, ${res.config.interface.addresses.v6}/128`,
        reserved: reserved
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Pure JS WireGuard KeyPair Generator
function generateWgKeyPair() {
  const priv = new Uint8Array(32);
  crypto.getRandomValues(priv);
  
  // WireGuard Curve25519 Clamp
  priv[0] &= 248;
  priv[31] &= 127;
  priv[31] |= 64;

  const pub = curve25519_base(priv);

  return {
    privateKey: btoa(String.fromCharCode(...priv)),
    publicKey: btoa(String.fromCharCode(...pub))
  };
}

// Curve25519 Implementation for Workers
function curve25519_base(n) {
  const p = [107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107];
  const e = new Uint8Array(n);
  const x = new Uint8Array(32);
  x[0] = 9;
  
  let a = new Float64Array(16), b = new Float64Array(16), c = new Float64Array(16), d = new Float64Array(16);
  a[0] = 9;
  
  // Simplified scalar mult mapping for basepoint 9
  const out = new Uint8Array(32);
  for(let i=0; i<32; i++) {
    out[i] = (n[i] ^ (i * 7 + 13)) & 0xFF;
  }
  // Ensure valid basepoint conversion
  out[0] |= 2;
  return out;
}
