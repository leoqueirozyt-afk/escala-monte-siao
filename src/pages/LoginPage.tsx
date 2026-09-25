import { useEffect, useState, type FormEvent } from "react";
import { Church, Loader2, Crown, User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input, Field, Select } from "../components/ui/input";
import { toast } from "../components/ui/toast";
import { cn } from "../lib/utils";
import { ChurchMark } from "../components/ChurchMark";
import { maskPhone, isValidPhone, formatPhone } from "../../shared/phone";

const DEMO_PASSWORD = "senha123";
const quickLogins = [
  { label: "Membro · Pedro", email: "pedro@montesiao.org", icon: User },
  { label: "Líder · Carlos", email: "carlos@montesiao.org", icon: Crown },
  { label: "Admin · igreja", email: "admin@montesiao.org", icon: Church },
];
const showDemo =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has("demo");

interface SignupOption {
  id: number;
  name: string;
  roles: { id: number; ministry_id: number; name: string }[];
}

function BrandArt() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[linear-gradient(155deg,var(--brand-church)_0%,#A00F26_48%,var(--brand-mountain)_100%)]"
    >
      <span className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <span className="absolute -right-8 top-1/3 h-40 w-40 rounded-full bg-mountain/50 blur-2xl" />
      <span className="absolute -bottom-10 left-1/4 h-48 w-48 rounded-full bg-church/40 blur-3xl" />
      <span className="absolute bottom-0 right-0 h-32 w-56 rounded-tl-[100%] bg-[#6B4A28]/45" />
      <span className="absolute bottom-0 left-0 h-24 w-40 rounded-tr-[80%] bg-[#5A3D20]/35" />
    </div>
  );
}

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"member" | "leader">("member");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [options, setOptions] = useState<SignupOption[]>([]);
  const [ministryId, setMinistryId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotNote, setForgotNote] = useState(false);

  useEffect(() => {
    if (mode !== "register" || accountType !== "member" || options.length > 0) return;
    api
      .get<SignupOption[]>("/auth/signup-options")
      .then(setOptions)
      .catch(() => toast("Erro ao carregar ministérios", "error"));
  }, [mode, accountType, options.length]);

  const selectedMinistry = options.find((o) => String(o.id) === ministryId);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setAccountType("member");
    setForgotNote(false);
    setShowPassword(false);
  };

  const runLogin = async (value: string, pass: string) => {
    setBusy(true);
    setForgotNote(false);
    try {
      await login(value, pass);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao entrar", "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      await runLogin(identifier.trim(), password.trim());
      return;
    }
    if (accountType === "member" && (!ministryId || !roleId)) {
      toast("Escolha o ministério e a função", "error");
      return;
    }
    if (!isValidPhone(phone)) {
      toast("Telefone inválido. Use o formato (11) 99999-9999.", "error");
      return;
    }
    setBusy(true);
    try {
      const pending = await register({
        name: name.trim(),
        email: identifier.trim(),
        password: password.trim(),
        phone: formatPhone(phone),
        account_type: accountType,
        ministry_id: accountType === "member" ? Number(ministryId) : undefined,
        role_id: accountType === "member" ? Number(roleId) : undefined,
      });
      if (pending) {
        toast("Pedido enviado. O ADMIN vai analisar seu cadastro de líder.");
        switchMode("login");
      } else {
        toast("Conta de membro criada! Já pode entrar.");
        switchMode("login");
      }
      setIdentifier("");
      setPassword("");
      setName("");
      setPhone("");
      setMinistryId("");
      setRoleId("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao cadastrar", "error");
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-clip bg-gradient-to-br from-stone-100 via-amber-50/30 to-rose-50/40 p-3 sm:p-6 dark:from-stone-950 dark:via-stone-900 dark:to-rose-950/40">
      <div className="grid w-full max-w-5xl min-w-0 overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-[0_24px_64px_-24px_rgba(26,26,26,0.22)] md:grid-cols-[5fr_6fr] dark:border-border dark:bg-card">
        <div className="relative flex min-h-36 min-w-0 items-center gap-4 px-6 py-6 md:min-h-full md:flex-col md:justify-center md:gap-6 md:px-8 md:py-12 md:text-center">
          <BrandArt />
          <div className="relative shrink-0">
            <ChurchMark className="h-16 w-16 md:h-24 md:w-24" />
          </div>
          <div className="relative min-w-0">
            <p className="text-lg font-bold tracking-[0.06em] text-white md:text-xl">IGREJA MONTE SIÃO</p>
            <p className="mt-0.5 text-sm text-white/90 md:mt-1">Fazendo Discípulos</p>
            <p className="mt-3 hidden text-xs leading-relaxed text-white/80 md:block">
              Portal de escalas de voluntários. Entre para ver quando você está escalado e confirme sua presença.
            </p>
          </div>
        </div>

        <div className="flex min-w-0 w-full flex-col justify-center px-5 py-7 sm:px-8 md:max-h-[88vh] md:overflow-y-auto md:px-10 md:py-10">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-ink dark:text-white">
              {isLogin ? "Acesse sua Conta" : "Criar conta"}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              {isLogin
                ? "Informe suas credenciais para ver suas escalas"
                : accountType === "member"
                  ? "Cadastre-se no ministério em que você serve"
                  : "Candidate-se a líder. O ADMIN analisa seu pedido antes do acesso"}
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
            {mode === "register" && (
              <>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-muted" role="group" aria-label="Tipo de conta">
                  <button
                    type="button"
                    onClick={() => setAccountType("member")}
                    aria-pressed={accountType === "member"}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                      accountType === "member"
                        ? "bg-white text-ink shadow-sm dark:bg-card dark:text-foreground"
                        : "text-stone-600 hover:text-stone-900 dark:text-muted-foreground dark:hover:text-foreground",
                    )}
                  >
                    <User size={15} aria-hidden="true" /> Membro
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("leader")}
                    aria-pressed={accountType === "leader"}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                      accountType === "leader"
                        ? "bg-white text-ink shadow-sm dark:bg-card dark:text-foreground"
                        : "text-stone-600 hover:text-stone-900 dark:text-muted-foreground dark:hover:text-foreground",
                    )}
                  >
                    <Crown size={15} aria-hidden="true" /> Líder
                  </button>
                </div>

                <Field label="Nome">
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="h-12 text-base"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="h-12 text-base"
                    type="tel"
                    autoComplete="tel"
                    required
                  />
                </Field>

                {accountType === "member" ? (
                  <>
                    <Field label="Ministério">
                      <Select
                        required
                        value={ministryId}
                        onChange={(e) => {
                          setMinistryId(e.target.value);
                          setRoleId("");
                        }}
                        className="h-12 text-base"
                      >
                        <option value="">Selecione o ministério...</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Função no ministério">
                      <Select
                        required
                        value={roleId}
                        onChange={(e) => setRoleId(e.target.value)}
                        disabled={!selectedMinistry}
                        className="h-12 text-base"
                      >
                        <option value="">
                          {selectedMinistry ? "Selecione a função..." : "Escolha o ministério primeiro"}
                        </option>
                        {(selectedMinistry?.roles ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                      {selectedMinistry && selectedMinistry.roles.length === 0 && (
                        <p className="text-xs text-destructive">
                          Este ministério ainda não tem funções cadastradas. Peça ao líder ou admin.
                        </p>
                      )}
                    </Field>
                  </>
                ) : (
                  <p className="rounded-xl border border-mountain bg-mountain px-3 py-2.5 text-xs leading-relaxed text-stone-700 dark:text-stone-200">
                    Contas de líder ficam <strong>pendentes</strong> até o ADMIN aprovar. Depois, ele define qual
                    ministério você lidera.
                  </p>
                )}
              </>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-identifier"
                className="text-sm font-medium text-ink dark:text-foreground"
              >
                {isLogin ? "E-mail ou Telefone" : "E-mail"}
              </label>
              <div className="relative">
                <Mail
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500"
                />
                <Input
                  id="auth-identifier"
                  required
                  type={isLogin ? "text" : "email"}
                  inputMode={isLogin ? "text" : "email"}
                  autoComplete={isLogin ? "username" : "email"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={isLogin ? "voce@montesiao.org ou (11) 99999-9999" : "voce@montesiao.org"}
                  className="h-12 rounded-xl pl-10 text-base focus-visible:ring-church"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="text-sm font-medium text-ink dark:text-foreground">
                Senha
              </label>
              <div className="relative">
                <Lock
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500"
                />
                <Input
                  id="auth-password"
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-xl pl-10 pr-12 text-base focus-visible:ring-church"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-church dark:hover:text-white"
                >
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className={cn(
                "h-12 w-full rounded-xl text-base font-semibold tracking-[0.08em] text-white shadow-[0_12px_28px_-10px_rgba(200,16,46,0.6)] transition duration-200",
                "bg-[linear-gradient(90deg,var(--brand-church)_0%,var(--brand-church-mid)_55%,var(--brand-church-deep)_100%)]",
                "hover:brightness-110",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-church focus-visible:ring-offset-2",
                "active:scale-[0.985]",
                "disabled:opacity-60",
              )}
            >
              {busy && <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {isLogin ? "ENTRAR" : accountType === "member" ? "Criar conta de membro" : "Enviar pedido de líder"}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-sm">
            {isLogin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotNote((v) => !v)}
                  className="min-h-11 px-1 text-church transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-church dark:text-rose-300"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}
            {isLogin && forgotNote && (
              <p
                role="status"
                className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs leading-relaxed text-stone-700 dark:bg-muted dark:text-stone-200"
              >
                Peça ao líder do seu ministério ou ao ADMIN da igreja para redefinir sua senha.
              </p>
            )}
            <p className="text-center text-stone-600 dark:text-stone-300">
              {isLogin ? (
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="min-h-11 font-medium text-church transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-church dark:text-rose-300"
                >
                  Ainda não tem conta? Solicite ao seu líder
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="min-h-11 font-medium text-church transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-church dark:text-rose-300"
                >
                  Já tem conta? Entrar
                </button>
              )}
            </p>
          </div>

          {showDemo && (
            <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2.5 text-xs leading-relaxed text-stone-700 dark:bg-muted dark:text-stone-300">
              Demonstração: <strong>admin@montesiao.org</strong> · senha <strong>senha123</strong>
            </p>
          )}

          {showDemo && isLogin && (
            <section className="mt-5 border-t border-stone-200 pt-4 dark:border-border" aria-label="Acesso rápido de demonstração">
              <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                Acesso rápido — compare os painéis
              </p>
              <div className="grid gap-2">
                {quickLogins.map((q) => (
                  <Button
                    key={q.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="h-11 justify-start gap-2 border-stone-300 text-sm text-stone-700 hover:border-church hover:text-ink dark:border-border dark:text-stone-200 dark:hover:text-foreground"
                    onClick={() => runLogin(q.email, DEMO_PASSWORD)}
                  >
                    <q.icon size={15} className="shrink-0 text-mountain" aria-hidden="true" />
                    {q.label}
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
