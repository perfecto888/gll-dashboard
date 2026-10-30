import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./lux.css";

// Shared shell for the black-and-gold public pages (/apply/peptide, /apply/ns100, /apply/webinar).
// Same type pairing as goldenlotuslabs.com: serif display headline, DM Sans body.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--lux-display" });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--lux-body" });

// brand/theme let a co-branded page (e.g. QuantisPeptides × GLL) reuse the shell; theme adds a modifier class.
export function LuxPage({ sub, brand = "Golden Lotus Labs", theme, children }: { sub: string; brand?: string; theme?: string; children: React.ReactNode }) {
  return (
    <div className={`lux-page ${theme ? `lux-${theme}` : ""} ${display.variable} ${body.variable}`}>
      <header className="lux-header">
        <div className="lux-brand">{brand}</div>
        <div className="lux-brand-sub">{sub}</div>
      </header>
      <main className="lux-wrap">{children}</main>
      <footer className="lux-footer">
        Golden Lotus Labs &nbsp;·&nbsp; <a href="https://www.goldenlotuslabs.com">goldenlotuslabs.com</a>
      </footer>
    </div>
  );
}

/** YouTube embed in the gold frame, or a "coming soon" panel until a video ID is set. */
// videoId is a YouTube ID; pass loomId instead for a Loom recording (the id in loom.com/share/<id>).
// aspect overrides the frame ratio when a recording isn't the default Loom shape; wide lets the frame
// extend past the 880px text column.
export function LuxVideo({ videoId = "", loomId = "", aspect, wide, title, pending }: { videoId?: string; loomId?: string; aspect?: string; wide?: boolean; title: string; pending: string }) {
  if (loomId)
    return (
      <div className={`lux-video lux-video-loom${wide ? " lux-video-wide" : ""}`} style={aspect ? { aspectRatio: aspect } : undefined}>
        <iframe src={`https://www.loom.com/embed/${loomId}`} title={title} allowFullScreen />
      </div>
    );
  if (!videoId)
    return (
      <div className="lux-video lux-video-pending">
        <div>
          <div className="lux-play" aria-hidden="true">▶</div>
          <p>{pending}</p>
        </div>
      </div>
    );
  return (
    <div className="lux-video">
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&controls=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
