import { observer } from 'mobx-react-lite';
import { InstallApp } from '@/components/Settings/Integrations/InstallApp.tsx';
import { Bookmarklet } from '@/components/Settings/Integrations/Bookmarklet.tsx';
import { BrowserExtension } from '@/components/Settings/Integrations/BrowserExtension.tsx';
export const SettingsIntegrations = observer(({ onSuccess }: { onSuccess?: () => void }) => {
  return (
    <div className="mx-auto w-full space-y-4">
      <InstallApp />
      <Bookmarklet onSuccess={onSuccess} />
      <BrowserExtension />
    </div>
  );
});
