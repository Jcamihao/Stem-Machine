// import de arquivo como texto (Vite): import page from './remote/page.html?raw'
declare module '*?raw' {
  const content: string
  export default content
}
