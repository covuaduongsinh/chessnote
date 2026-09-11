import type { Path } from "@silverbulletmd/silverbullet/lib/ref";
import { useEffect, useRef } from "preact/hooks";
import * as featherIcons from "preact-feather";
import type { DocumentTab } from "../types/ui.ts";

export type DocumentTabBarProps = {
  tabs: DocumentTab[];
  activeTabPath?: Path;
  unsavedChanges?: boolean;
  onSelectTab: (tab: DocumentTab) => void;
  onCloseTab: (tab: DocumentTab) => void;
  onPinTab?: (tab: DocumentTab) => void;
  onNewTab: () => void;
  onCloseOtherTabs?: (tab: DocumentTab) => void;
  lhsSpacer?: any;
  rhsSpacer?: any;
};

export function DocumentTabBar({
  tabs,
  activeTabPath,
  unsavedChanges,
  onSelectTab,
  onCloseTab,
  onPinTab,
  onNewTab,
  onCloseOtherTabs,
  lhsSpacer,
  rhsSpacer,
}: DocumentTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(
      ".sb-tab.active",
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTabPath]);

  if (!tabs || tabs.length === 0) {
    return null;
  }

  // Sort pinned tabs first
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <div id="sb-tab-bar" className="sb-tab-bar">
      {lhsSpacer}
      <div className="sb-tab-scroll-container" ref={scrollRef}>
        <div className="sb-tab-list">
          {sortedTabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                className={`sb-tab ${isActive ? "active" : ""} ${
                  tab.pinned ? "pinned" : ""
                }`}
                title={`${tab.title} (${tab.path})`}
                onClick={() => {
                  if (!isActive) {
                    onSelectTab(tab);
                  }
                }}
                onAuxClick={(e) => {
                  // Middle mouse click to close tab
                  if (e.button === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloseTab(tab);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (onCloseOtherTabs) {
                    onCloseOtherTabs(tab);
                  }
                }}
              >
                {tab.pinned ? (
                  <span
                    className="sb-tab-pin-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPinTab) onPinTab(tab);
                    }}
                    title="Bỏ ghim tab"
                  >
                    <featherIcons.Bookmark size={12} />
                  </span>
                ) : (
                  <span className="sb-tab-icon">
                    <featherIcons.FileText size={12} />
                  </span>
                )}
                <span className="sb-tab-title">{tab.title}</span>
                {isActive && unsavedChanges && (
                  <span
                    className="sb-tab-unsaved-dot"
                    title="Thay đổi chưa lưu"
                  />
                )}
                <button
                  type="button"
                  className="sb-tab-close"
                  title="Đóng tab (hoặc nhấn chuột giữa)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab);
                  }}
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sb-tab-actions">
        <button
          type="button"
          className="sb-tab-add-button"
          title="Mở thêm tài liệu (Ctrl+K)"
          onClick={onNewTab}
        >
          <featherIcons.Plus size={14} />
        </button>
      </div>
      {rhsSpacer}
    </div>
  );
}
