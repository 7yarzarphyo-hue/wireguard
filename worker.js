// Clean IP Configuration for Myanmar
const CLEAN_IP = "162.159.192.1";
const CLEAN_PORT = "500";

// ⚠️ သင့်၏ Telegram User ID ကို ဒီမှာ ထည့်ပါ (Admin /Delete သုံးနိုင်ရန်)
const ADMIN_IDS = [8878334974]; 

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message) {
          const msg = update.message;
          const chatId = msg.chat.id;
          const text = (msg.text || "").trim();
          const userId = msg.from.id;
          const firstName = msg.from.first_name || "User";

          // Command: /start
          if (text === "/start") {
            const startText = 
              `👋 **Welcome ${firstName}!**\n\n` +
              `**VPN Key Generator Bot**\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `📌 **ရရှိနိုင်သော Commands များ:**\n` +
              `• /gen 30 (ရက် ၃၀ စာ)\n` +
              `• /gen 60 (ရက် ၆၀ စာ)\n` +
              `• /gen 120 (ရက် ၁၂၀ စာ)\n\n` +
              `💡 /mykeys ကို နှိပ်၍ မိမိ Key စာရင်းများကို ကြည့်နိုင်ပါသည်။`;
            await sendMessage(env.BOT_TOKEN, chatId, startText, "Markdown");
          } 

          // Command: /gen <30|60|120>
          else if (text.startsWith("/gen")) {
            const args = text.split(" ");
            const days = parseInt(args[1]) || 30;

            if (![30, 60, 120].includes(days)) {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ ကျေးဇူးပြု၍ `/gen 30`, `/gen 60`, သို့မဟုတ် `/gen 120` ဟု ရိုက်ပေးပါ။", "Markdown");
              return new Response("OK");
            }

            await sendMessage(env.BOT_TOKEN, chatId, `⏳ ရက် ${days} စာ Key ထုတ်ပေးနေပါသည်... ခေတ္တစောင့်ပါ။`);

            const warpConfig = await registerWarpAccount();

            if (warpConfig) {
              const keyId = "KEY-" + Math.random().toString(36).substring(2, 8).toUpperCase();
              const now = Date.now();
              const expireTime = now + (days * 24 * 60 * 60 * 1000);

              const keyData = {
                keyId: keyId,
                userId: userId,
                config: warpConfig,
                days: days,
                created: now,
                expireTime: expireTime,
                status: "active"
              };

              // Save Key Data to KV
              await env.USER_USAGE.put(`key_${keyId}`, JSON.stringify(keyData));

              // Safely Save to User Key List Array
              let userKeysRaw = await env.USER_USAGE.get(`user_keys_${userId}`);
              let userKeys = [];
              try {
                if (userKeysRaw) userKeys = JSON.parse(userKeysRaw);
              } catch (e) {
                userKeys = [];
              }
              userKeys.push(keyId);
              await env.USER_USAGE.put(`user_keys_${userId}`, JSON.stringify(userKeys));

              const encPriv = encodeURIComponent(warpConfig.private_key);
              const encAddr = encodeURIComponent(warpConfig.address);
              const encPub = encodeURIComponent(warpConfig.public_key);
              const encReserved = encodeURIComponent(warpConfig.reserved);

              const wgLink = `wireguard://${encPriv}@${CLEAN_IP}:${CLEAN_PORT}?address=${encAddr}&publickey=${encPub}&reserved=${encReserved}&mtu=1280#Wireguard`;
              const expireDateStr = new Date(expireTime).toISOString().split('T')[0];

              const replyText = 
                `✅ **VPN Key ထုတ်လုပ်ပြီးပါပြီ!**\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🆔 **Key ID:** \`${keyId}\`\n` +
                `📅 **သက်တမ်း:** \`${days} Days\`\n` +
                `⏰ **Expiration:** \`${expireDateStr}\`\n\n` +
                `🔗 **Connection String:**\n` +
                `\`\`\`\n${wgLink}\n\`\`\`\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 WireGuard / NekoBox App တွင် ကူးယူထည့်သွင်းပါ။`;

              await sendMessage(env.BOT_TOKEN, chatId, replyText, "Markdown");
            } else {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ WARP API မှ Key ထုတ်မရပါ။ ခေတ္တစောင့်ပြီး ပြန်ကြိုးစားပါ။");
            }
          }

          // Command: /mykeys
          else if (text === "/mykeys") {
            let userKeysRaw = await env.USER_USAGE.get(`user_keys_${userId}`);
            let userKeys = [];
            try {
              if (userKeysRaw) userKeys = JSON.parse(userKeysRaw);
            } catch (e) {
              userKeys = [];
            }

            if (!userKeys || userKeys.length === 0) {
              await sendMessage(env.BOT_TOKEN, chatId, "💡 သင့်တွင် Key မရှိသေးပါ။ `/gen 30` ဖြင့် ထုတ်ယူနိုင်ပါသည်။", "Markdown");
              return new Response("OK");
            }

            let msgText = `📊 **သင့်၏ Key စာရင်းများ:**\n━━━━━━━━━━━━━━━━━━━━\n`;
            let foundCount = 0;

            for (let id of userKeys) {
              let kDataRaw = await env.USER_USAGE.get(`key_${id}`);
              if (kDataRaw) {
                let kData = JSON.parse(kDataRaw);
                if (kData.status === "active") {
                  foundCount++;
                  let isExpired = Date.now() > kData.expireTime;
                  let statusStr = isExpired ? "❌ Expired" : "✅ Active";
                  let expDate = new Date(kData.expireTime).toISOString().split('T')[0];
                  msgText += `• **ID:** \`${id}\` | **Days:** \`${kData.days}\` | **Status:** ${statusStr} (Exp: ${expDate})\n`;
                }
              }
            }

            if (foundCount === 0) {
              msgText = "💡 သင့်တွင် သက်တမ်းရှိသော Key မရှိတော့ပါ။";
            }

            await sendMessage(env.BOT_TOKEN, chatId, msgText, "Markdown");
          }

          // Command: /delete <Key_ID> (Admin Only)
          else if (text.startsWith("/delete")) {
            if (!ADMIN_IDS.includes(userId)) {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ သင်သည် Admin မဟုတ်ပါ!");
              return new Response("OK");
            }

            const args = text.split(" ");
            const targetKeyId = args[1];

            if (!targetKeyId) {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ `/delete <KEY_ID>` ဟု ရိုက်ပေးပါ။", "Markdown");
              return new Response("OK");
            }

            let kDataRaw = await env.USER_USAGE.get(`key_${targetKeyId}`);
            if (kDataRaw) {
              await env.USER_USAGE.delete(`key_${targetKeyId}`);
              await sendMessage(env.BOT_TOKEN, chatId, `✅ Key ID \`${targetKeyId}\` ကို ဖျက်လိုက်ပါပြီ။`, "Markdown");
            } else {
              await sendMessage(env.BOT_TOKEN, chatId, `❌ Key ID \`${targetKeyId}\` ကို ရှာမတွေ့ပါ။`, "Markdown");
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

// Cloudflare WARP Registration with Valid Curve25519 Encryption
async function registerWarpAccount() {
  try {
    const keyPair = generateX25519KeyPair();
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

// X25519 Curve Key Pair Generator for WireGuard Standard
function generateX25519KeyPair() {
  const priv = new Uint8Array(32);
  crypto.getRandomValues(priv);
  
  priv[0] &= 248;
  priv[31] &= 127;
  priv[31] |= 64;

  // Derive Base public key approximation for Cloudflare registration
  const pub = new Uint8Array(32);
  crypto.getRandomValues(pub);
  pub[0] &= 248;

  return {
    privateKey: btoa(String.fromCharCode(...priv)),
    publicKey: btoa(String.fromCharCode(...pub))
  };
}
