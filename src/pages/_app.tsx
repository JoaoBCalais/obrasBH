import type { AppProps } from 'next/app'
import Head from 'next/head'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2a78d6" />
        <meta name="description" content="Fiscalize, vote e acompanhe as obras da sua cidade" />
        <title>ObrasBH — Transparência em Obras Públicas</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
}
