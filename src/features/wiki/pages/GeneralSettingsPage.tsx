import { Switch } from "@chanho/react";
import { Moon, SlidersHorizontal } from "lucide-react";
import { useTheme } from "../../../app/theme";
import { SettingsHeader, SettingsItem } from "../components/SettingsItem";

/** WIKI 개인 설정의 안정적인 진입점. 서버 저장이 필요 없는 화면 환경부터 한곳에 모은다. */
export function GeneralSettingsPage() {
  const { theme, toggle } = useTheme();

  return (
    <div className="space-settings">
      <SettingsHeader
        icon={<SlidersHorizontal size={20} aria-hidden="true" />}
        title="일반 설정"
        description="이 브라우저에서 사용할 화면 환경을 관리합니다."
      />
      <div className="space-settings-form">
        <SettingsItem
          icon={<Moon size={18} aria-hidden="true" />}
          title="화면 테마"
          description="밝은 화면과 어두운 화면을 전환합니다. 변경 사항은 이 브라우저에만 저장됩니다."
          control={
            <Switch
              label="다크 모드"
              checked={theme === "dark"}
              onCheckedChange={(checked) => {
                if (checked !== (theme === "dark")) toggle();
              }}
            />
          }
        />
      </div>
    </div>
  );
}
