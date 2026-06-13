'use client'

// Holographic "Digital Pass" — landing showcase for online booking + QR check-in.
// Adapted (namespaced .mlpass-*, trimmed animations) from a Uiverse design.
// Hover to flip: front = pass info, back = the QR a venue scans at check-in.

// Decorative QR — a deterministic module grid with the 3 finder squares. It's a
// visual showcase (not a scannable code), so we generate it inline (no heavy
// base64, no corruption risk) and let CSS size it.
function QrMock({ className }: { className?: string }) {
  const N = 25
  const finder = (x: number, y: number): boolean | null => {
    const inBox = (bx: number, by: number) => x >= bx && x < bx + 7 && y >= by && y < by + 7
    const ring = (bx: number, by: number) => {
      const lx = x - bx, ly = y - by
      return lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4)
    }
    if (inBox(0, 0)) return ring(0, 0)
    if (inBox(N - 7, 0)) return ring(N - 7, 0)
    if (inBox(0, N - 7)) return ring(0, N - 7)
    return null
  }
  const cells: React.ReactElement[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = finder(x, y)
      const on = f === null ? (x * 7 + y * 13 + x * y * 3) % 5 < 2 : f
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />)
    }
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${N} ${N}`}
      fill="#0b0e14"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {cells}
    </svg>
  )
}

export function DigitalPass() {
  return (
    <div className="mlpass-stage">
      <div className="mlpass-float">
        <div className="mlpass-flip">
          {/* front — pass info */}
          <div className="mlpass-front">
            <div className="mlpass-body">
              <div className="mlpass-reflex" />
              <header className="mlpass-header">
                <div className="mlpass-name">
                  <span>MARTELOUNGE</span>
                  <b>PASS</b>
                </div>
                <span className="mlpass-barcode" />
              </header>
              <div className="mlpass-contents">
                <div className="mlpass-event">
                  <div className="mlpass-event-main"><b>VIP</b> 01</div>
                  <div className="mlpass-event-sub">GAMING</div>
                </div>
                <div className="mlpass-number">#001</div>
                <div className="mlpass-qr">
                  <QrMock />
                </div>
              </div>
            </div>
          </div>

          {/* back — big QR for check-in */}
          <div className="mlpass-back">
            <div className="mlpass-body">
              <div className="mlpass-reflex" />
              <header className="mlpass-header">
                <div className="mlpass-name">
                  <span>MARTELOUNGE</span>
                  <b>PASS</b>
                </div>
                <time className="mlpass-time">
                  <span>27</span><span className="mlpass-slash">/</span><span>08</span><span className="mlpass-slash">/</span><span>2026</span>
                </time>
              </header>
              <div className="mlpass-contents">
                <div className="mlpass-qr mlpass-qr-lg">
                  <QrMock />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
