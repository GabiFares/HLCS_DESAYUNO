export function HotelLogo({ className = "size-10" }: { className?: string }) {
  return (
    <img src="/logos/hotel-los-cedros.png" alt="Logo de Hotel Los Cedros"
      width={277} height={281} draggable={false}
      className={`${className} shrink-0 select-none object-contain`} />
  );
}
