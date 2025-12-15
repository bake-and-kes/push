import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@dokut.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://dokuthub.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

export default async function handler(req, res) {
  cors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.split('?')[0].replace('/api/push', '');

  // ========== RUTA: /api/push/subscribe ==========
  if (path === '/subscribe' && req.method === 'POST') {
    try {
      const { endpoint, p256dh, auth, store_id, user_agent } = req.body;

      if (!endpoint || !p256dh || !auth || !store_id) {
        return res.status(400).json({ success: false, error: 'Faltan datos' });
      }

      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', endpoint)
        .eq('store_id', store_id)
        .maybeSingle();

      if (existing) {
        const { data } = await supabase
          .from('push_subscriptions')
          .update({
            p256dh,
            auth,
            is_active: true,
            last_seen: new Date().toISOString(),
            user_agent
          })
          .eq('id', existing.id)
          .select()
          .single();

        return res.status(200).json({
          success: true,
          subscription_id: data.id,
          message: 'Suscripción actualizada'
        });
      }

      const { data } = await supabase
        .from('push_subscriptions')
        .insert([{
          endpoint,
          p256dh,
          auth,
          store_id,
          user_agent,
          is_active: true,
          last_seen: new Date().toISOString()
        }])
        .select()
        .single();

      return res.status(200).json({
        success: true,
        subscription_id: data.id,
        message: 'Suscripción creada'
      });

    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== RUTA: /api/push/send ==========
  if (path === '/send' && req.method === 'POST') {
    try {
      const { title, body, icon, url, campaign_name, store_id, user_id } = req.body;

      if (!title || !body || !store_id || !user_id) {
        return res.status(400).json({ success: false, error: 'Faltan datos' });
      }

      const { data: campaign } = await supabase
        .from('push_campaigns')
        .insert([{
          store_id,
          user_id,
          name: campaign_name || 'Sin nombre',
          title,
          body,
          icon: icon || null,
          url: url || null,
          status: 'sent',
          sent_at: new Date().toISOString()
        }])
        .select()
        .single();

      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('store_id', store_id)
        .eq('is_active', true);

      if (!subscriptions || subscriptions.length === 0) {
        await supabase
          .from('push_campaigns')
          .update({ sent_count: 0, failed_count: 0 })
          .eq('id', campaign.id);

        return res.status(200).json({
          success: true,
          campaign_id: campaign.id,
          sent: 0,
          message: 'No hay suscriptores'
        });
      }

      const notification = {
        title,
        body,
        icon: icon || 'https://dokuthub.online/icon.png',
        badge: 'https://dokuthub.online/badge.png',
        data: {
          url: url || '/',
          campaign_id: campaign.id,
          store_id
        },
        actions: [
          { action: 'open', title: '👀 Ver' },
          { action: 'close', title: '✖️ Cerrar' }
        ]
      };

      let sentCount = 0;
      let failedCount = 0;

      await Promise.all(subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notification)
          );
          
          await supabase.from('push_sends').insert([{
            campaign_id: campaign.id,
            subscription_id: sub.id,
            status: 'sent',
            sent_at: new Date().toISOString()
          }]);

          sentCount++;
        } catch (error) {
          const statusCode = error.statusCode || 500;
          
          if (statusCode === 410 || statusCode === 404 || statusCode === 401) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          
          await supabase.from('push_sends').insert([{
            campaign_id: campaign.id,
            subscription_id: sub.id,
            status: 'failed',
            error_message: error.message,
            sent_at: new Date().toISOString()
          }]);
          
          failedCount++;
        }
      }));

      await supabase
        .from('push_campaigns')
        .update({ sent_count: sentCount, failed_count: failedCount })
        .eq('id', campaign.id);

      return res.status(200).json({
        success: true,
        campaign_id: campaign.id,
        sent: sentCount,
        failed: failedCount,
        total: subscriptions.length
      });

    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== RUTA: /api/push/schedule ==========
  if (path === '/schedule' && req.method === 'POST') {
    try {
      const { title, body, icon, url, campaign_name, store_id, user_id, scheduled_for } = req.body;

      if (!title || !body || !store_id || !user_id || !scheduled_for) {
        return res.status(400).json({ success: false, error: 'Faltan datos' });
      }

      const scheduledDate = new Date(scheduled_for);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ success: false, error: 'Fecha debe ser futura' });
      }

      const { data } = await supabase
        .from('push_campaigns')
        .insert([{
          store_id,
          user_id,
          name: campaign_name || 'Programada',
          title,
          body,
          icon: icon || null,
          url: url || null,
          status: 'scheduled',
          scheduled_for: scheduledDate.toISOString()
        }])
        .select()
        .single();

      return res.status(200).json({
        success: true,
        campaign_id: data.id,
        scheduled_for: scheduledDate.toISOString()
      });

    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== RUTA: /api/push/track-click ==========
  if (path === '/track-click' && req.method === 'POST') {
    try {
      const { campaign_id, subscription_id } = req.body;

      if (!campaign_id) {
        return res.status(400).json({ success: false, error: 'Falta campaign_id' });
      }

      await supabase.from('push_clicks').insert([{
        campaign_id,
        subscription_id: subscription_id || null,
        clicked_at: new Date().toISOString()
      }]);

      const { data: campaign } = await supabase
        .from('push_campaigns')
        .select('click_count')
        .eq('id', campaign_id)
        .single();

      const newClickCount = (campaign?.click_count || 0) + 1;

      await supabase
        .from('push_campaigns')
        .update({ click_count: newClickCount })
        .eq('id', campaign_id);

      return res.status(200).json({ success: true, click_count: newClickCount });

    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== RUTA: /api/push/stats ==========
  if (path === '/stats' && req.method === 'GET') {
    try {
      const { store_id } = req.query;

      if (!store_id) {
        return res.status(400).json({ success: false, error: 'Falta store_id' });
      }

      const { data: campaigns } = await supabase
        .from('push_campaigns')
        .select('*')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false });

      return res.status(200).json({ 
        success: true,
        campaigns: campaigns || [] 
      });

    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
}
