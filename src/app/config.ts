// Endereço e chave PÚBLICA do banco. A chave publicável pode ficar no código do site:
// quem protege os dados é a RLS do banco, não o segredo da chave.
// Por enquanto o Reboka divide o projeto Enter-Labs com outros produtos (tabelas com prefixo reboka_).
// Ao migrar para um banco próprio, basta aplicar supabase/migrations lá e trocar os dois valores abaixo.
export const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL ?? 'https://nsghugwgocrlyoekpgnj.supabase.co';
export const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY ?? 'sb_publishable_hF4XxU7LV5GXI_TunS9mTg_p_fOtTzC';
