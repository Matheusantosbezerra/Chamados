
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Método não permitido." }, 405);
  }

  let createdUserId: string | null = null;
  let createdCustomerId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Validar usuário autenticado
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Autenticação necessária." }, 401);
    }

    const token = authorization.replace("Bearer ", "");

    const {
      data: { user: requester },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !requester) {
      return response({ error: "Sessão inválida." }, 401);
    }

    // 2. Receber dados
    const body = await req.json();

    const organizationId = body.organization_id;
    const clientCompanyId = body.client_company_id;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim() || null;

    if (
      !organizationId ||
      !clientCompanyId ||
      !name ||
      !email
    ) {
      return response({
        error: "Informe empresa, organização, nome e e-mail.",
      }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response({ error: "E-mail inválido." }, 400);
    }

    // 3. Confirmar se o solicitante é OWNER ou ADMIN
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", requester.id)
      .maybeSingle();

    if (
      membershipError ||
      !membership ||
      !["OWNER", "ADMIN"].includes(membership.role)
    ) {
      return response({
        error: "Você não tem permissão para cadastrar clientes.",
      }, 403);
    }

    // 4. Confirmar se a empresa pertence à organização
    const { data: company, error: companyError } = await supabase
      .from("client_companies")
      .select("id, name")
      .eq("id", clientCompanyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (companyError || !company) {
      return response({
        error: "Empresa não encontrada nesta organização.",
      }, 404);
    }

    // 5. Verificar se o contato já existe na organização
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .maybeSingle();

    if (existingCustomer) {
      return response({
        error: "Já existe um contato com este e-mail nesta organização.",
      }, 409);
    }

    // 6. Criar conta de autenticação
    const { data: authData, error: createUserError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          account_type: "customer",
        },
      });

    if (createUserError || !authData.user) {
      return response({
        error: createUserError?.message || "Não foi possível criar a conta.",
      }, 400);
    }

    createdUserId = authData.user.id;

    // 7. Criar contato
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        organization_id: organizationId,
        client_company_id: clientCompanyId,
        name,
        email,
        phone,
      })
      .select("id")
      .single();

    if (customerError || !customer) {
      throw new Error(customerError?.message || "Erro ao criar contato.");
    }

    createdCustomerId = customer.id;

    // 8. Vincular conta à empresa
    const { error: linkError } = await supabase
      .from("customer_users")
      .insert({
        client_company_id: clientCompanyId,
        user_id: createdUserId,
        customer_id: customer.id,
      });

    if (linkError) {
      throw new Error(linkError.message);
    }

    // 9. Gerar link para definir senha
    const redirectTo =
      "https://chamados-pink.vercel.app/redefinir-senha";

    const { data: linkData, error: linkGenerationError } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

    if (linkGenerationError || !linkData.properties?.action_link) {
      throw new Error(
        linkGenerationError?.message || "Erro ao gerar link de acesso."
      );
    }

    const actionLink = linkData.properties.action_link;

    // 10. Enviar e-mail pelo Resend
    const safeName = escapeHtml(name);
    const safeCompany = escapeHtml(company.name);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Inderio Desk <no-reply@inderio.com.br>",
        to: [email],
        subject: "Defina sua senha - Inderio Desk",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
            <h2>Bem-vindo ao Inderio Desk!</h2>
            <p>Olá, ${safeName}.</p>
            <p>Seu acesso ao portal de atendimento da empresa
            <strong>${safeCompany}</strong> foi criado.</p>
            <p>Para começar, defina sua senha clicando no botão abaixo:</p>
            <p style="margin:30px 0">
              <a href="${actionLink}"
                style="background:#2563eb;color:#fff;padding:14px 24px;
                text-decoration:none;border-radius:6px;display:inline-block">
                Definir minha senha
              </a>
            </p>
            <p>Se você não esperava este e-mail, pode ignorá-lo.</p>
            <p>Equipe Inderio Desk</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();
      throw new Error(`Erro no Resend: ${emailError}`);
    }

    return response({
      success: true,
      message: "Cliente cadastrado e e-mail enviado.",
      customer_id: customer.id,
    });

  } catch (error) {
    // Reverter os registros criados caso alguma etapa falhe
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (createdCustomerId) {
      await supabase
        .from("customers")
        .delete()
        .eq("id", createdCustomerId);
    }

    if (createdUserId) {
      await supabase
        .from("customer_users")
        .delete()
        .eq("user_id", createdUserId);

      await supabase.auth.admin.deleteUser(createdUserId);
    }

    console.error("create-customer:", error);

    return response({
      error: error instanceof Error
        ? error.message
        : "Erro interno ao cadastrar cliente.",
    }, 500);
  }
});
