import mongoose from "mongoose";

const SavingsRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  screenshot: { type: String, required: false, default: "" }, // base64 string (optional)
}, { timestamps: true });

export const SavingsRecord = mongoose.model("SavingsRecord", SavingsRecordSchema);
