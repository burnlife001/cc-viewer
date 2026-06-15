import { ChevronRight, Clock, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SessionMeta } from "@/types";
import {
  formatRelativeTime,
  formatSessionTitle,
  getBaseName,
  getSessionKey,
  highlightText,
} from "./utils";

interface SessionItemProps {
  session: SessionMeta;
  isSelected: boolean;
  searchQuery?: string;
  onSelect: (key: string) => void;
}

export function SessionItem({
  session,
  isSelected,
  searchQuery,
  onSelect,
}: SessionItemProps) {
  const { t } = useTranslation();
  const title = formatSessionTitle(session);
  const lastActive = session.lastActiveAt || session.createdAt || undefined;
  const sessionKey = getSessionKey(session);
  const dirName = getBaseName(session.projectDir);

  return (
    <button
      type="button"
      onClick={() => onSelect(sessionKey)}
      className={cn(
        "w-full text-left flex flex-col rounded-lg px-3 py-2.5 transition-all group",
        isSelected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/60 border border-transparent",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium line-clamp-2 flex-1">
          {searchQuery ? highlightText(title, searchQuery) : title}
        </span>
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground/50 shrink-0 transition-transform",
            isSelected && "text-primary rotate-90",
          )}
        />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {lastActive
            ? formatRelativeTime(lastActive, t)
            : t("common.unknown")}
        </span>
        {dirName && (
          <span className="flex items-center gap-1 truncate">
            <FolderOpen className="size-3" />
            <span className="truncate max-w-[160px]">{dirName}</span>
          </span>
        )}
      </div>
    </button>
  );
}
