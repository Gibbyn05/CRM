import Image from "next/image";

export default function MediaNorgeLogo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/media-norge-logo.png"
      alt="Media Norge"
      width={512}
      height={512}
      priority={priority}
      className={className}
    />
  );
}
