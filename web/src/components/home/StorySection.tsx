import { Icon } from '../common/Icon'

export function StorySection() {
  return (
    <section className="story" id="historia">
      <div className="story__image"><img src="https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1300&q=85" alt="Detalhes de um ambiente acolhedor" loading="lazy" /></div>
      <div className="story__content">
        <span className="eyebrow">Nossa forma de morar</span>
        <h2>Design que aproxima<br />beleza e cotidiano.</h2>
        <p>Escolhemos peças honestas, materiais duráveis e formas que continuam relevantes com o passar do tempo. Cada objeto nasce para fazer parte da sua história — não apenas da decoração.</p>
        <a className="text-link" href="#colecao">Conheça nossa curadoria <Icon name="arrow" size={17} /></a>
      </div>
    </section>
  )
}
