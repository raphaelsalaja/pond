import { Logo } from "@pond/ui/logo";
import styles from "./styles.module.css";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Runs during HTML parsing so returning visitors skip the splash before the first paint. */
const ONCE_A_WEEK = `(function(){var s=document.currentScript.previousElementSibling;try{var k="pond:splash",n=Date.now(),l=Number(localStorage.getItem(k));if(l&&n-l<${WEEK}){s.setAttribute("data-splash-seen","")}else{localStorage.setItem(k,String(n))}}catch(e){}})()`;

export function Splash() {
  return (
    <>
      <div className={styles.splash} aria-hidden suppressHydrationWarning>
        <div className={styles.mark}>
          <Logo className={styles.logo} size={48} aria-hidden />
        </div>
      </div>
      {/* oxlint-disable-next-line react/no-danger -- static inline script, no user input */}
      <script dangerouslySetInnerHTML={{ __html: ONCE_A_WEEK }} />
    </>
  );
}
