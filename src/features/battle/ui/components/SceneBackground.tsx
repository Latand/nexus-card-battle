export function SceneBackground() {
  return (
    <div
      className="absolute inset-0 -z-20 min-h-full bg-[length:100%_100%,cover] bg-[position:center,center_top] bg-no-repeat max-[960px]:bg-[length:100%_100%,100%_100%]"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(18,15,18,0.18), rgba(18,15,18,0.64) 62%, #120f12), url('/generated/klanz-battle-bg.png')",
      }}
    >
      <div className="absolute inset-0 opacity-40 [clip-path:polygon(0_18%,100%_8%,100%_70%,0_82%)] [background:repeating-linear-gradient(90deg,transparent_0_38px,rgba(255,202,87,0.28)_39px_43px,transparent_44px_88px),repeating-linear-gradient(0deg,transparent_0_34px,rgba(255,255,255,0.05)_35px_37px,transparent_38px_78px)]" />
      <div className="absolute inset-x-[-6%] bottom-0 h-[38%] skew-y-[-4deg] [background:linear-gradient(110deg,transparent_0_12%,rgba(236,177,62,0.32)_12%_14%,transparent_14%_100%),linear-gradient(180deg,rgba(15,14,16,0),rgba(15,14,16,0.94)_36%),repeating-linear-gradient(100deg,#1a1517_0_62px,#241b1a_63px_94px)]" />
    </div>
  );
}
