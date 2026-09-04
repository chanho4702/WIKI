import { useCallback, useEffect, useState } from "react";
import { Banner, Radio, RadioGroup, Switch, useToast } from "@chanho/react";
import { AtSign, Bell, Clock, FileText, Mail, MessageSquare, Share2 } from "lucide-react";
import { SettingsHeader, SettingsItem } from "../components/SettingsItem";
import type { NotificationPrefs, NotificationPrefsPatch } from "../store/types";
import { getNotificationPrefs, updateNotificationPrefs } from "../store/wikiStore";

const TYPE_ROWS: Array<{
  key: "mentioned" | "pageUpdated" | "comment" | "shared";
  icon: typeof Bell;
  label: string;
  hint: string;
}> = [
  { key: "mentioned", icon: AtSign, label: "나를 멘션했을 때", hint: "본문이나 댓글에서 @이름으로 나를 불렀을 때 보냅니다." },
  // 스페이스 구독(W27-4)의 새 문서 알림도 이 스위치를 함께 쓴다 — 종류마다 스위치를 늘리면
  // 설정 화면이 고르는 화면이 아니라 목록이 된다. 문구가 그 범위를 말해야 한다.
  { key: "pageUpdated", icon: FileText, label: "구독한 문서·스페이스에 변화가 있을 때", hint: "내가 만들거나 고쳤거나 직접 구독한 문서가 바뀌면, 구독한 스페이스에 새 문서가 올라오면 보냅니다." },
  { key: "comment", icon: MessageSquare, label: "구독한 문서에 댓글이 달렸을 때", hint: "구독한 문서에 새 댓글이 달리면 보냅니다." },
  { key: "shared", icon: Share2, label: "누군가 문서를 공유했을 때", hint: "공유한 사람의 메모가 함께 옵니다." },
];

/**
 * 알림 설정(`/settings/notifications`, W23) — 이메일 채널.
 *
 * 알림함은 벨 아이콘 안에만 있어서 위키를 열어 두지 않은 사람은 멘션을 몇 시간 뒤에야 봤다.
 * 여기서 "어떤 알림을 메일로도 받을지"를 정한다. 알림함 자체는 끄지 못한다 — 그것은 채널이
 * 아니라 원본이다.
 *
 * 스위치는 누르는 즉시 저장한다(컨플루언스와 같다). 저장 버튼을 두면 "껐는데 계속 온다"의
 * 절반이 저장을 안 누른 경우가 된다.
 *
 * 발송 구성이 없는 서버(WIKI_MAIL_HOST 비어 있음)에서는 배너로 먼저 말한다 — 스위치를 켰는데
 * 아무것도 오지 않는 것이 최악의 경험이다.
 */
export function NotificationSettingsPage() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotificationPrefs()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "알림 설정을 불러오지 못했습니다"); });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(
    async (patch: Partial<NotificationPrefsPatch>) => {
      if (!prefs) return;
      const next: NotificationPrefsPatch = {
        emailEnabled: prefs.emailEnabled,
        emailMode: prefs.emailMode,
        mentioned: prefs.mentioned,
        pageUpdated: prefs.pageUpdated,
        comment: prefs.comment,
        shared: prefs.shared,
        ...patch,
      };
      // 낙관적으로 먼저 바꾼다 — 스위치가 서버 왕복만큼 늦게 움직이면 두 번 누르게 된다
      setPrefs({ ...prefs, ...next });
      setSaving(true);
      try {
        setPrefs(await updateNotificationPrefs(next));
      } catch (e) {
        setPrefs(prefs);
        toast({ title: e instanceof Error ? e.message : "알림 설정을 저장하지 못했습니다", appearance: "danger" });
      } finally {
        setSaving(false);
      }
    },
    [prefs, toast],
  );

  const header = (
    <SettingsHeader
      icon={<Bell size={20} aria-hidden="true" />}
      title="알림 설정"
      description="알림함(벨)은 항상 켜져 있습니다. 여기서는 어떤 알림을 이메일로도 받을지 정합니다."
    />
  );

  if (error) {
    return (
      <div className="space-settings" role="alert">
        {header}
        <Banner variant="danger">{error}</Banner>
      </div>
    );
  }
  if (!prefs) {
    return (
      <div className="space-settings" role="status">
        {header}
        <p className="space-settings-desc">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="space-settings">
      {header}

      <div className="space-settings-form">
        {!prefs.emailConfigured ? (
          <Banner variant="info">
            이 서버에는 이메일 발송이 구성되어 있지 않습니다. 설정은 저장되지만 메일은 가지 않습니다 —
            운영자가 <code>WIKI_MAIL_HOST</code>를 설정하면 그때부터 적용됩니다.
          </Banner>
        ) : null}

        <SettingsItem
          icon={<Mail size={18} aria-hidden="true" />}
          description={
            <>
              받는 주소:{" "}
              {prefs.email ? <strong>{prefs.email}</strong> : <span>아직 알 수 없음 — 로그인 계정의 이메일을 씁니다.</span>}
              {" "}이 스위치를 끄면 아래 항목과 무관하게 메일이 가지 않습니다.
            </>
          }
          control={
            <Switch
              label="이메일로 알림 받기"
              checked={prefs.emailEnabled}
              disabled={saving}
              onCheckedChange={(checked) => void save({ emailEnabled: checked })}
            />
          }
        />

        {/* 요약 모드 — 멘션이 잦은 사람에게 건당 메일은 폭주다. 하루 한 번 한 통으로 모은다 */}
        <SettingsItem
          icon={<Clock size={18} aria-hidden="true" />}
          title="보내는 방식"
          description="바로 보내면 일이 생길 때마다 한 통, 하루 한 번이면 그날 있었던 일을 아침 9시에 한 통으로 모읍니다."
        >
          <RadioGroup
            aria-label="보내는 방식"
            value={prefs.emailMode}
            disabled={saving || !prefs.emailEnabled}
            onValueChange={(v: string) => void save({ emailMode: v === "DAILY" ? "DAILY" : "IMMEDIATE" })}
          >
            <Radio value="IMMEDIATE" label="바로 보내기" />
            <Radio value="DAILY" label="하루 한 번 모아서" />
          </RadioGroup>
        </SettingsItem>

        <ul className="settings-item-list" aria-label="이메일로 받을 알림">
          {TYPE_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key}>
                <SettingsItem
                  icon={<Icon size={18} aria-hidden="true" />}
                  description={row.hint}
                  control={
                    <Switch
                      label={row.label}
                      checked={prefs[row.key]}
                      disabled={saving || !prefs.emailEnabled}
                      onCheckedChange={(checked) => void save({ [row.key]: checked })}
                    />
                  }
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
