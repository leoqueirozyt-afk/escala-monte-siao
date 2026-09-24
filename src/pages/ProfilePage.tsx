import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Save, Camera } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field } from "../components/ui/input";
import { toast } from "../components/ui/toast";

function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas não suportado"));
        return;
      }
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo de imagem inválido"));
    };
    img.src = url;
  });
}

export function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", max_services_per_month: 4 });
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        max_services_per_month: user.max_services_per_month,
      });
      setAvatar(user.avatar_url);
    }
  }, [user]);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Escolha um arquivo de imagem", "error");
      return;
    }
    setSavingPhoto(true);
    try {
      const data = await fileToAvatar(file);
      setAvatar(data);
      await api.put(`/users/${user!.id}`, { avatar_url: data });
      await refresh();
      toast("Foto de perfil atualizada!");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar foto", "error");
    } finally {
      setSavingPhoto(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/users/${user!.id}`, {
        ...form,
        max_services_per_month: Number(form.max_services_per_month),
        password: password || undefined,
      });
      setPassword("");
      await refresh();
      toast("Perfil atualizado!");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={savingPhoto}
          className="group relative h-16 w-16 overflow-hidden rounded-2xl bg-primary/15 text-2xl font-bold text-primary"
          title="Trocar foto"
        >
          {avatar ? (
            <img src={avatar} alt={user?.name} className="h-full w-full object-cover" />
          ) : (
            user?.name.charAt(0)
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={18} className="text-white" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        <div>
          <h1 className="text-xl font-bold">{user?.name}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <p className="text-xs font-medium text-primary">{roleLabel(user?.role)}</p>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline hover:text-primary"
            onClick={() => fileRef.current?.click()}
            disabled={savingPhoto}
          >
            {savingPhoto ? "Salvando foto..." : avatar ? "Alterar foto" : "Adicionar foto"}
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
          <CardDescription>Atualize suas informações de contato</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Telefone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Máx. de escalas por mês">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.max_services_per_month}
                onChange={(e) => setForm({ ...form, max_services_per_month: Number(e.target.value) })}
              />
            </Field>
            <Field label="Nova senha (opcional)">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe em branco para manter"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              <Save size={16} /> Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full text-destructive"
        onClick={async () => {
          await logout();
          navigate("/login");
        }}
      >
        <LogOut size={16} /> Sair da conta
      </Button>

      <p className="text-center text-xs text-muted-foreground">Escala Monte Sião · PWA</p>
    </div>
  );
}
