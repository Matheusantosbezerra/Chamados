
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Configuração do Supabase incompleta.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return response({ error: "Usuário não autenticado." }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return response({ error: "Sessão inválida ou expirada." }, 401);
    }

    const body = await req.json();
    const token = String(body?.token || "").trim();

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return response({ error: "Link de convite inválido." }, 400);
    }

    const userEmail = user.email?.trim().toLowerCase();

    if (!userEmail) {
      return response({ error: "Conta sem e-mail válido." }, 400);
    }

    const tokenHash = await hashToken(token);

    // 1. Localiza o convite.
    const { data: invitation, error: invitationError } =
      await adminClient
        .from("customer_invitations")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();

    if (invitationError) throw invitationError;

    if (!invitation) {
      return response({ error: "Convite não encontrado." }, 404);
    }

    if (invitation.status !== "PENDING") {
      return response({ error: "Este convite não está mais disponível." }, 400);
    }

    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      return response({ error: "Este convite expirou." }, 400);
    }

    if (invitation.email.trim().toLowerCase() !== userEmail) {
      return response({
        error: "Entre com o mesmo e-mail que recebeu o convite.",
      }, 403);
    }

    // 2. Confirma a existência da empresa.
    const { data: company, error: companyError } = await adminClient
      .from("client_companies")
      .select("id, organization_id")
      .eq("id", invitation.client_company_id)
      .eq("organization_id", invitation.organization_id)
      .maybeSingle();

    if (companyError) throw companyError;

    if (!company) {
      return response({ error: "Empresa cliente não encontrada." }, 404);
    }

    // 3. Verifica se o usuário já está vinculado à empresa.
    const { data: existingLink, error: linkError } =
      await adminClient
        .from("customer_users")
        .select("id, customer_id")
        .eq("client_company_id", invitation.client_company_id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (linkError) throw linkError;

    // 4. Procura o contato pelo e-mail na organização inteira.
    const { data: existingCustomer, error: customerError } =
      await adminClient
        .from("customers")
        .select("id, client_company_id, name, email")
        .eq("organization_id", invitation.organization_id)
        .ilike("email", userEmail)
        .maybeSingle();

    if (customerError) throw customerError;

    // Impede que o mesmo contato seja associado a outra empresa.
    if (
      existingCustomer &&
      existingCustomer.client_company_id !== invitation.client_company_id
    ) {
      return response({
        error: "Este e-mail já está cadastrado em outra empresa desta organização. Entre em contato com o administrador.",
      }, 409);
    }

    // Impede conflito com um vínculo existente.
    if (
      existingLink?.customer_id &&
      existingCustomer &&
      existingLink.customer_id !== existingCustomer.id
    ) {
      return response({
        error: "Esta conta já está vinculada a outro contato da empresa.",
      }, 409);
    }

    // 5. Cria o contato somente se ainda não existir.
    let customerId = existingCustomer?.id;

    if (!customerId) {
      const fullName = String(
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        userEmail.split("@")[0]
      ).trim();

      const { data: newCustomer, error: createError } =
        await adminClient
          .from("customers")
          .insert({
            organization_id: invitation.organization_id,
            client_company_id: invitation.client_company_id,
            name: fullName,
            email: userEmail,
          })
          .select("id")
          .single();

      if (createError) throw createError;

      customerId = newCustomer.id;
    }

    // 6. Cria ou completa o vínculo do usuário.
    if (existingLink) {
      if (!existingLink.customer_id) {
        const { error: updateLinkError } = await adminClient
          .from("customer_users")
          .update({ customer_id: customerId })
          .eq("id", existingLink.id);

        if (updateLinkError) throw updateLinkError;
      }
    } else {
      const { error: createLinkError } = await adminClient
        .from("customer_users")
        .insert({
          client_company_id: invitation.client_company_id,
          user_id: user.id,
          customer_id: customerId,
        });

      if (createLinkError) throw createLinkError;
    }

    // 7. Atualiza o tipo da conta.
    const { error: metadataError } =
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          account_type: "customer",
        },
      });

    if (metadataError) throw metadataError;

    // 8. Marca o convite como aceito.
    const { data: acceptedInvitation, error: acceptError } =
      await adminClient
        .from("customer_invitations")
        .update({
          status: "ACCEPTED",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("status", "PENDING")
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();

    if (acceptError) throw acceptError;

    if (!acceptedInvitation) {
      return response({
        error: "O convite foi alterado ou expirou durante o processamento.",
      }, 409);
    }

    return response({
      success: true,
      message: "Convite aceito! Sua conta foi vinculada à empresa.",
      organization_id: invitation.organization_id,
      client_company_id: invitation.client_company_id,
    });

  } catch (error) {
    console.error("Erro ao aceitar convite de cliente:", error);

    return response({
      error: "Não foi possível concluir o convite. Tente novamente.",
    }, 500);
  }
});
