// pacote sem tipos: devolve um AudioNode com métodos extras (schedule, start, latency...)
declare module 'signalsmith-stretch' {
  const SignalsmithStretch: (
    context: BaseAudioContext,
    options?: AudioWorkletNodeOptions
  ) => Promise<AudioNode & Record<string, any>>
  export default SignalsmithStretch
}
