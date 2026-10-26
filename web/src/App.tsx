import StopsMap from "./StopsMap";

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <a href="/" className="logo-link">
          <img src="/logo-header.svg" alt="STOPS" className="logo" />
        </a>
        <p>Ireland's bus stops and what they have.</p>
      </header>
      <StopsMap />
    </div>
  );
}
