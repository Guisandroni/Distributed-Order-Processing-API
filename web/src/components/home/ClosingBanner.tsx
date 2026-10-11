import { Icon } from '../common/Icon'

export function ClosingBanner() {
  return (
    <section className="closing-banner">
      <div>
        <span className="eyebrow">Casa é sensação</span>
        <h2>Menos excesso.<br />Mais significado.</h2>
        <a href="#colecao">Explorar peças <Icon name="arrow" size={18} /></a>
      </div>
    </section>
  )
}
