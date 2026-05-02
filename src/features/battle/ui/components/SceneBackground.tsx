export function SceneBackground() {
  return (
    <div
      className="absolute inset-0 -z-20 min-h-full overflow-hidden bg-[#05080b] bg-[length:cover] bg-[position:center] bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(5,8,11,0.08), rgba(5,8,11,0.36) 48%, rgba(5,8,11,0.92)), url('/nexus-assets/backgrounds/arena-bar-1024x576.png')",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,34,182,0.32),transparent_22%),radial-gradient(circle_at_82%_18%,rgba(56,213,255,0.28),transparent_24%),linear-gradient(90deg,rgba(255,48,48,0.08),transparent_24%_76%,rgba(255,190,53,0.12))]" />
      <div className="absolute inset-x-[-8%] bottom-[-4%] h-[46%] skew-y-[-3deg] opacity-70 [background:linear-gradient(90deg,transparent_0_13%,rgba(248,180,47,0.38)_13.4%_14%,transparent_14.4%_86%,rgba(248,180,47,0.36)_86.4%_87%,transparent_87.4%),linear-gradient(180deg,rgba(5,8,11,0),rgba(5,8,11,0.92)_52%),repeating-linear-gradient(100deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_84px),repeating-linear-gradient(0deg,rgba(255,255,255,0.04)_0_1px,transparent_1px_52px)]" />
      <div className="absolute inset-0 shadow-[inset_0_0_160px_rgba(0,0,0,0.95),inset_0_0_0_1px_rgba(255,209,92,0.18)]" />
    </div>
  );
}
