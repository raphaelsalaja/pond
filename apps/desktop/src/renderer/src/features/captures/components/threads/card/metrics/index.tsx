import {
  IconThreadsLike,
  IconThreadsReply,
  IconThreadsRepost,
  IconThreadsShare,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import type { TweetCardMetrics } from "@/features/captures/components/tweet/card/lib/data";
import { formatCount } from "@/shared/lib/format";
import styles from "./styles.module.css";

export function Metrics({ metrics }: { metrics: TweetCardMetrics }) {
  const items: Array<{
    key: string;
    label: string;
    Icon: IconComponent;
    value: number | undefined;
  }> = [
    {
      key: "likes",
      label: "Likes",
      Icon: IconThreadsLike,
      value: metrics.likes,
    },
    {
      key: "replies",
      label: "Replies",
      Icon: IconThreadsReply,
      value: metrics.replies,
    },
    {
      key: "retweets",
      label: "Reposts",
      Icon: IconThreadsRepost,
      value: metrics.retweets,
    },
    {
      key: "shares",
      label: "Shares",
      Icon: IconThreadsShare,
      value: metrics.shares,
    },
  ];

  const shown = items.filter((i) => i.value !== undefined);
  if (shown.length === 0) return null;

  return (
    <div className={styles.metrics}>
      {shown.map(({ key, label, Icon, value }) => (
        <span key={key} className={styles.metric}>
          <Icon className={styles.icon} size={18} title={label} />
          <span className={styles.value}>{formatCount(value ?? 0)}</span>
        </span>
      ))}
    </div>
  );
}
