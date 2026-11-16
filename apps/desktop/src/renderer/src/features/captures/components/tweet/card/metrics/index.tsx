import {
  IconTweetBookmark,
  IconTweetLike,
  IconTweetReply,
  IconTweetRepost,
  IconTweetViews,
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
      key: "replies",
      label: "Replies",
      Icon: IconTweetReply,
      value: metrics.replies,
    },
    {
      key: "retweets",
      label: "Retweets",
      Icon: IconTweetRepost,
      value: metrics.retweets,
    },
    {
      key: "likes",
      label: "Likes",
      Icon: IconTweetLike,
      value: metrics.likes,
    },
    {
      key: "views",
      label: "Views",
      Icon: IconTweetViews,
      value: metrics.views,
    },
    {
      key: "bookmarks",
      label: "Bookmarks",
      Icon: IconTweetBookmark,
      value: metrics.bookmarks,
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
