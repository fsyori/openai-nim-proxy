// server.js - OpenAI to NVIDIA NIM API Proxy (Cloudflare Workers Version)

const MODEL_MAPPING = {
  'qwen': 'qwen/qwen3.5-397b-a17b',
  'qwen-low': 'qwen/qwen3.5-122b-a10b',
  'kimi': 'moonshotai/kimi-k2-instruct-0905',
  'dst-3.1': 'deepseek-ai/deepseek-v3.1-terminus',
  'ds-flash': 'deepseek-ai/deepseek-v4-flash',
  'ds-pro': 'deepseek-ai/deepseek-v4-pro',
  'z-ai': 'z-ai/glm-5.1',
  'qwen-think': 'qwen/qwen3-next-80b-a3b-thinking',
  'qwem-ins': 'qwen/qwen3-next-80b-a3b-instruct',
};

const SHOW_REASONING = false;
const ENABLE_THINKING_MODE = true;
const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const NIM_API_KEY = env.NIM_API_KEY;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'Worker Proxy' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List models
    if (url.pathname === '/v1/models') {
      const models = Object.keys(MODEL_MAPPING).map(model => ({
        id: model,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'nvidia-nim-proxy'
      }));
      return new Response(JSON.stringify({ object: 'list', data: models }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Chat completions
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { model, messages, temperature, max_tokens, stream } = body;

        let nimModel = MODEL_MAPPING[model] || model;

        const nimRequest = {
          model: nimModel,
          messages: messages,
          temperature: temperature || 0.6,
          max_tokens: max_tokens || 4096,
          extra_body: ENABLE_THINKING_MODE ? { chat_template_kwargs: { thinking: true } } : undefined,
          stream: stream || false
        };

        const response = await fetch(`${NIM_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NIM_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(nimRequest)
        });

        // Simply pipe the stream or return the JSON
        if (stream) {
          const { readable, writable } = new TransformStream();
          response.body.pipeTo(writable);
          return new Response(readable, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
        } else {
          const data = await response.json();
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
