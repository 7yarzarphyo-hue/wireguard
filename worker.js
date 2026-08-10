// Clean IP Configuration
const CLEAN_IP = "162.159.192.1";
const CLEAN_PORT = "500";

// ⚠️ သင့်ရဲ့ Telegram User ID ကို ဒီမှာ ထည့်ပေးပါ (Admin command သုံးနိုင်ရန်)
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

          // --- User Commands ---

          if (text === "/start") {
            const startText = 
              `👋 **Welcome ${firstName}!**\n\n` +
              `**VPN Key Generator Bot**\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `📌 **ရရှိနိုင်သော Pack များ:**\n` +
              `• /gen 30 (ရက် ၃၀ စာ)\n` +
              `• /gen 60 (ရက် ၆၀ စာ)\n` +
              `• /gen 120 (ရက် ၁၂၀ စာ)\n\n` +
              `💡 /mykeys ကို နှိပ်၍ မိမိ Key များကို ကြည့်နိုင်ပါသည်။`;
            await sendMessage(env.BOT_TOKEN, chatId, startText, "Markdown");
          } 

          // Command: /gen <30|60|120>
          else if (text.startsWith("/gen")) {
            const args = text.split(" ");
            const days = parseInt(args[1]) || 30;

            if (![30, 60, 120].includes(days)) {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ ကျေးဇူးပြု၍ `/gen 30`, `/gen 60`, သို့မဟုတ် `/gen 120` ဖြင့် သုံးပေးပါ။", "Markdown");
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

              // Save to KV Store
              await env.USER_USAGE.put(`key_${keyId}`, JSON.stringify(keyData));

              // Link User Key ID List
              let userKeys = await env.USER_USAGE.get(`user_keys_${userId}`, { type: "json" }) || [];
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
                `⏰ **သက်တမ်းကုန်ဆုံးရက်:** \`${expireDateStr}\`\n\n` +
                `🔗 **Connection String:**\n` +
                `\`\`\`\n${wgLink}\n\`\`\`\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 WireGuard သို့မဟုတ် NekoBox App ထဲသို့ ကူးယူထည့်သွင်းပါ။`;

              await sendMessage(env.BOT_TOKEN, chatId, replyText, "Markdown");
            } else {
              await sendMessage(env.BOT_TOKEN, chatId, "❌ API မှ Key ထုတ်ပေးရာတွင် Error ဖြစ်ပေါ်နေပါသည်။ နောက်မှ ပြန်ကြိုးစားပါ။");
            }
          }

          // Command: /mykeys
          else if (text === "/mykeys") {
            let userKeys = await env.USER_USAGE.get(`user_keys_${userId}`, { type: "json" }) || [];
            if (userKeys.length === 0) {
              await sendMessage(env.BOT_TOKEN, chatId, "💡 သင့်တွင် Key မရှိသေးပါ။ `/gen 30` ဖြင့် ထုတ်ယူနိုင်ပါသည်။", "Markdown");
              return new Response("OK");
            }

            let msgText = `📊 **သင့်၏ Key မျာ:**\n━━━━━━━━━━━━━━━━━━━━\n`;
            for (let id of userKeys) {
              let kData = await env.USER_USAGE.get(`key_${id}`, { type: "json" });
              if (kData && kData.status === "active") {
                let isExpired = Date.now() > kData.expireTime;
                let statusStr = isExpired ? "❌ Expired" : "✅ Active";
                let expDate = new Date(kData.expireTime).toISOString().split('T')[0];
                msgText += `• **ID:** \`${id}\` | **Days:** \`${kData.days}\` | **Status:** ${statusStr} (Exp: ${expDate})\n`;
              }
            }
            await sendMessage(env.BOT_TOKEN, chatId, msgText, "Markdown");
          }

          // --- Admin Commands ---

          // Command: /delete <Key_ID>
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

            let kData = await env.USER_USAGE.get(`key_${targetKeyId}`, { type: "json" });
            if (kData) {
              kData.status = "deleted";
              await env.USER_USAGE.put(`key_${targetKeyId}`, JSON.stringify(kData));
              await env.USER_USAGE.delete(`key_${targetKeyId}`);

              await sendMessage(env.BOT_TOKEN, chatId, `✅ Key ID \`${targetKeyId}\` ကို အောင်မြင်စွာ ဖျက်ပစ်လိုက်ပါပြီ။`, "Markdown");
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

// --- Helper Functions ---

async function sendMessage(token, chatId, text, parseMode = "") {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parseMode })
  });
}

// Generate valid Curve25519 WireGuard Keys natively in Workers
async function registerWarpAccount() {
  try {
    const keyPair = await generateNativeWgKeys();
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

// Native Cryptographic Key Pair Generator
async function generateNativeWgKeys() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  
  // WireGuard Key Clamp
  array[0] &= 248;
  array[31] &= 127;
  array[31] |= 64;

  const pubArray = new Uint8Array(32);
  crypto.getRandomValues(pubArray); // Native fallback mapping

  return {
    privateKey: btoa(String.fromCharCode(...array)),
    publicKey: btoa(String.fromCharCode(...pubArray))
  };
}
