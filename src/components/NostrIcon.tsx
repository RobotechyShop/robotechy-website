/**
 * The Nostr ostrich/logo mark — the same artwork used by the footer's Nostr
 * social link, the "Follow Us" button and the product "Share" button. Inherits
 * the current text colour via `fill="currentColor"`.
 */
export function NostrIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M128,0C57.308,0,0,57.308,0,128s57.308,128,128,128,128-57.308,128-128S198.692,0,128,0Zm56.414,181.707-13.328-5.332a15.5,15.5,0,0,0-11.516.165l-11.833,5.063a31.124,31.124,0,0,1-24.3-.044l-11.656-4.993a15.523,15.523,0,0,0-11.528-.165l-13.328,5.332a7.5,7.5,0,0,1-10.088-3.889l-25.6-64a7.5,7.5,0,0,1,3.889-10.088l13.328-5.332a15.523,15.523,0,0,0,9.03-9.03l5.332-13.328a7.5,7.5,0,0,1,10.088-3.889l64,25.6a7.5,7.5,0,0,1,3.889,10.088l-5.332,13.328a15.523,15.523,0,0,0,.165,11.528l4.993,11.656a31.124,31.124,0,0,1,.044,24.3l-5.063,11.833a15.5,15.5,0,0,0-.165,11.516l5.332,13.328A7.5,7.5,0,0,1,184.414,181.707Z" />
    </svg>
  );
}
