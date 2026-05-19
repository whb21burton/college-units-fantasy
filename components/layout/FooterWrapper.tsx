'use client';
import { useEffect, useState } from 'react';
import Footer from './Footer';

export default function FooterWrapper() {
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setInIframe(window.self !== window.top);
  }, []);

  if (inIframe) return null;
  return <Footer />;
}
