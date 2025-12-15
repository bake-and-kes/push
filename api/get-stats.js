import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper para configurar CORS
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
};

export default async function handler(req, res) {
  // Configurar CORS
  setCorsHeaders(res);
  
  // Manejar preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    const { store_id } = req.query;

    // Validar que se proporcione store_id
    if (!store_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere store_id' 
      });
    }

    console.log('📊 Obteniendo estadísticas para tienda:', store_id);

    // Obtener campañas de la tienda
    const { data: campaigns, error } = await supabase
      .from('push_campaigns')
      .select('*')
      .eq('store_id', store_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo campañas:', error);
      throw error;
    }

    console.log(`✅ ${campaigns?.length || 0} campañas encontradas`);

    return res.status(200).json({ 
      success: true,
      campaigns: campaigns || [] 
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno del servidor' 
    });
  }
}
