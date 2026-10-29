import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { KIND_ICON, openInNewTab } from '@/lib/items';
import type { Item } from '@/lib/types';

// Shown in the preview pane when there's nothing to display, with ways forward.
export function Message({ item, text, children }: { item: Item; text: string; children?: ReactNode }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Icon className="text-muted-foreground/60 size-10" />
      <p className="text-muted-foreground max-w-sm text-sm">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {children}
        {(item.url || item.file?.id) && (
          <Button variant="outline" size="sm" onClick={() => openInNewTab(item)}>
            <ExternalLink /> Open in new tab
          </Button>
        )}
      </div>
    </div>
  );
}
