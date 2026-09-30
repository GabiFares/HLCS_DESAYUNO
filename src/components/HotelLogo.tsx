export function HotelLogo({ className = "size-10" }: { className?: string }) {
  return (
    <img src="/logos/hotel-los-cedros.svg" alt="Logo de Hotel Los Cedros"
      width={40} height={40} draggable={false} className={`${className} shrink-0 select-none rounded-full`} />
  );
}